import axios from "axios";
import https from "https";
import { promises as fs } from "fs";
import { setTimeout } from "timers/promises";
import { cleanAndNormalizeBidData } from "./utils/dataNormalization.js";
import { connectToSQLServer } from "./database/db.js";
import Bid from "./models/bidModel.js";

// Lấy tham số từ command line
const keyword = process.argv[2] || "";
const type = process.argv[3] || "";

// Cấu hình chung
const CONFIG = {
  API_URL: process.env.URL_API,
  PAGE_SIZE: 50,
  MAX_PAGE: 200,
  CONCURRENCY: 5,
  RETRY_LIMIT: 3,
  RETRY_DELAY: 1000,
  REQUEST_DELAY: 200,
  TIMEOUT: 10000,
  TEMP_SAVE_INTERVAL: 10,
};

// Tạo HTTPS agent
const agent = new https.Agent({
  rejectUnauthorized: false,
  keepAlive: true,
  maxSockets: CONFIG.CONCURRENCY,
});

// Headers cho request
const headers = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
};

// Xây dựng bộ lọc dựa trên loại gói thầu
function buildTypeFilters(type) {
  // Lấy thời gian hiện tại
  const currentTime = new Date().toISOString();

  // Bộ lọc cơ bản áp dụng cho mọi loại
  let filters = [
    {
      fieldName: "type",
      searchType: "in",
      fieldValues: ["es-notify-contractor"],
    },
    {
      fieldName: "caseKHKQ",
      searchType: "not_in",
      fieldValues: ["1"],
    },
  ];

  // Bộ lọc theo trạng thái
  const statusMap = {
    dangXetThau: "DXT",
    coNhaThauTrungThau: "CNTTT",
    khongCoNhaThauTrungThau: "KCNTTT",
    daHuyThau: "DHT",
    chuaMoThau: "",
    tuyenBoVoHieuQuyetDinhVeKqlcnt: "VHH",
    khongCongNhanKqlcnt: "KCN",
    dinhChiCuocThau: "DC",
  };

  // Xử lý theo loại
  if (type === "chuaDongThau") {
    filters.push({
      fieldName: "bidCloseDate",
      searchType: "range",
      from: currentTime,
      to: null,
    });
  } else if (type === "daDongThau" || statusMap[type]) {
    // Thêm filter đã đóng thầu
    filters.push({
      fieldName: "bidCloseDate",
      searchType: "range",
      from: null,
      to: currentTime,
    });

    // Nếu có trạng thái cụ thể, thêm filter trạng thái
    if (statusMap[type]) {
      filters.push({
        fieldName: "statusForNotify",
        searchType: "in",
        fieldValues: [statusMap[type]],
      });
    }
  }

  return filters;
}

// Tạo payload cho request
const createPayload = (page, keyword = "", typeFilter) => ({
  pageSize: CONFIG.PAGE_SIZE,
  pageNumber: page.toString(),
  query: [
    {
      index: "es-contractor-selection",
      keyWord: keyword,
      matchType: "all-1",
      matchFields: ["notifyNo", "bidName"],
      filters: typeFilter,
    },
  ],
});

// Hàm fetch với cơ chế retry
async function fetchWithRetry(page, keyword, typeFilter) {
  for (let attempt = 0; attempt < CONFIG.RETRY_LIMIT; attempt++) {
    try {
      await setTimeout(CONFIG.REQUEST_DELAY);

      const response = await axios.post(
        CONFIG.API_URL,
        [createPayload(page, keyword, typeFilter)],
        {
          headers,
          httpsAgent: agent,
          timeout: CONFIG.TIMEOUT,
        }
      );

      if (!response.data?.page?.content) {
        throw new Error("Cấu trúc phản hồi không hợp lệ");
      }

      return {
        success: true,
        data: response.data.page.content,
        page,
      };
    } catch (error) {
      if (error.response?.status === 404 || error.response?.status === 400) {
        console.log("🚫 Lỗi vĩnh viễn, dừng ngay");
        return {
          success: false,
          error: `Lỗi vĩnh viễn: ${error.message}`,
          page,
        };
      }

      if (attempt >= CONFIG.RETRY_LIMIT - 1) {
        return {
          success: false,
          error: `❌ Thất bại sau ${CONFIG.RETRY_LIMIT} lần thử`,
          page,
        };
      }

      const delay = CONFIG.RETRY_DELAY * (attempt + 1);
      await setTimeout(delay);
      console.log(
        `🔄 Thử lại lần ${attempt + 1} cho trang ${page} sau ${delay}ms`
      );
    }
  }
}

// Generator để lấy dữ liệu theo từng trang
async function* dataGenerator(keyword, typeFilter) {
  let page = 0;
  let hasMore = true;
  let consecutiveErrors = 0;

  while (hasMore && page < CONFIG.MAX_PAGE) {
    const result = await fetchWithRetry(page, keyword, typeFilter);

    if (!result.success) {
      console.error(`❌ Lỗi khi lấy trang ${page}:`, result.error);
      consecutiveErrors++;

      if (consecutiveErrors >= 3) {
        console.error("⚠️ Quá nhiều lỗi liên tiếp, dừng lại...");
        break;
      }

      page++;
      continue;
    }

    consecutiveErrors = 0;

    if (result.data.length === 0) {
      hasMore = false;
    } else {
      yield {
        data: result.data,
        page: result.page,
        isLast: false,
      };
      page++;
    }
  }

  yield { isLast: true };
}

// Xử lý stream dữ liệu
async function processDataStream(keyword, typeFilter) {
  let allData = [];
  let processedPages = 0;
  const generator = dataGenerator(keyword, typeFilter);
  const outputFile = `data-${keyword || "all"}-${type || "tatCa"}.json`;

  for await (const result of generator) {
    if (result.isLast) {
      console.log("🏁 Đã lấy hết dữ liệu");
      break;
    }

    allData.push(...result.data);
    processedPages++;
    console.log(
      `📊 Trang ${result.page}: +${result.data.length} mục (Tổng cộng: ${allData.length})`
    );

    if (processedPages % CONFIG.TEMP_SAVE_INTERVAL === 0) {
      await fs.writeFile(
        `temp-${outputFile}`,
        JSON.stringify(allData, null, 2)
      );
      console.log(`💾 Đã lưu tạm thời (${allData.length} mục)`);
    }
  }

  return allData;
}

// Lưu dữ liệu vào SQL Server
const saveToSQLServer = async (data) => {
  try {
    await Bid.destroy({ truncate: true });
    await Bid.bulkCreate(data);
    console.log(`💾 Đã lưu ${data.length} bản ghi vào SQL Server thành công!`);
  } catch (error) {
    console.error("❌ Lỗi khi lưu dữ liệu vào SQL Server:", error);
    throw error;
  }
};

// Hàm main
async function main() {
  try {
    console.time("⏳ Quá trình thu thập dữ liệu");

    // Kết nối SQL Server
    await connectToSQLServer();

    // Xây dựng bộ lọc dựa trên loại
    const typeFilter = buildTypeFilters(type);

    // Lấy dữ liệu
    const finalData = await processDataStream(keyword, typeFilter);

    if (finalData.length > 0) {
      // Làm sạch và chuẩn hóa dữ liệu
      const cleanedData = await cleanAndNormalizeBidData(finalData);

      // Lưu vào SQL Server
      await saveToSQLServer(cleanedData);

      // Lưu file json cuối cùng
      const outputFile = `data-${keyword || "all"}-${type || "tatCa"}.json`;
      await fs.writeFile(outputFile, JSON.stringify(cleanedData, null, 2));
      console.log(`📄 Đã lưu file dữ liệu cuối cùng: ${outputFile}`);
    } else {
      console.log("⚠️ Không có dữ liệu để lưu");
    }

    console.timeEnd("⏳ Quá trình thu thập dữ liệu");
  } catch (error) {
    console.error("❌ Lỗi nghiêm trọng:", error);
  } finally {
    agent.destroy();
  }
}

// Chạy chương trình
main();
