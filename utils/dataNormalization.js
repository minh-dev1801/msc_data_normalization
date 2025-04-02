import { ChatPromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from "@langchain/core/runnables";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import "dotenv/config";

const CONFIG = {
  CATEGORIES_FILE: "categories.json",
  CATEGORIES_PATH: "../configs/categories.json",
};

const configCategories = (categories = null) => {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const configPath = path.join(currentDir, CONFIG.CATEGORIES_PATH);
  return {
    configPath,
    flatCategoriesValue: categories ? Object.values(categories).flat() : null,
    flatCategoriesKey: categories ? Object.keys(categories) : null,
    flatCategoriesKeyLength: categories ? Object.keys(categories).length : null,
    flatCategoriesValueLength: categories
      ? Object.values(categories).flat().length
      : null,
  };
};

// Đọc cấu hình lĩnh vực từ file
const loadCategories = () => {
  try {
    const configPath = configCategories().configPath;
    if (!fs.existsSync(configPath)) {
      console.warn(
        "File cấu hình categories.json không tồn tại, sử dụng cấu hình mặc định"
      );
    }

    const data = fs.readFileSync(configPath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error("Lỗi khi đọc file cấu hình lĩnh vực:", error);
  }
};

// Hàm tạo prompt dựa trên danh sách lĩnh vực
const generateCategoryPrompt = (categories) => {
  const flatCategories = configCategories(categories).flatCategoriesValue;
  return `Dựa vào tiêu đề {title}, trả về CHÍNH XÁC một trong các lĩnh vực sau (chỉ trả về tên lĩnh vực, không thêm bất kỳ từ nào khác): ${flatCategories.join(
    ", "
  )}`;
};

export const cleanAndNormalizeBidData = async (rawData) => {
  // Tải cấu hình lĩnh vực
  const FIELD_CATEGORIES = loadCategories();
  const {
    flatCategoriesKeyLength: groupLength,
    flatCategoriesValueLength: fieldLength,
  } = configCategories(FIELD_CATEGORIES);
  const categoryPrompt = generateCategoryPrompt(FIELD_CATEGORIES); // Danh sách lĩnh vực

  console.log(
    `Đã tải ${groupLength} nhóm lĩnh vực với tổng cộng ${fieldLength} lĩnh vực`
  );

  const chain = RunnableSequence.from([
    ChatPromptTemplate.fromTemplate(categoryPrompt),
    new ChatOpenAI({
      modelName: "gpt-4o-mini",
      maxTokens: 10,
      temperature: 0,
      stop: ["\n"],
      openAIApiKey: process.env.OPENAI_API_KEY,
    }),
  ]);

  const closeDateThreshold = new Date();

  const cleanedData = await Promise.all(
    rawData.map(async (bid) => {
      try {
        const result = await chain.invoke({
          title: bid.bidName[0] || "",
        });

        // Lấy giá trị lĩnh vực từ kết quả AIMessage và xóa khoảng trắng
        const fieldCategory = result.content.trim();

        // Xác định nhóm lĩnh vực
        let fieldGroup = "OTHER";
        for (const [group, fields] of Object.entries(FIELD_CATEGORIES)) {
          if (fields.includes(fieldCategory)) {
            fieldGroup = group;
            break;
          }
        }

        const bidCloseDate = new Date(bid.bidCloseDate);
        const year = isNaN(bidCloseDate.getTime())
          ? null
          : bidCloseDate.getFullYear();
        const isClosed =
          year === null ? false : bidCloseDate <= closeDateThreshold;
        const hasWinner = isClosed && bid.statusForNotify === "CNTTT";

        return {
          id: bid.id,
          bidName: Array.isArray(bid.bidName) ? bid.bidName[0] : bid.bidName,
          bidCloseDate: bid.bidCloseDate,
          year,
          isClosed,
          hasWinner,
          investorName: bid.investorName?.trim().replace(/\s+/g, " ") || null,
          bidPrice: Number(
            Array.isArray(bid.bidPrice) ? bid.bidPrice[0] : bid.bidPrice
          ),
          fieldCategory,
          fieldGroup,
          vendorName: Array.isArray(bid.winningContractorName)
            ? bid.winningContractorName[0]
            : null,
        };
      } catch (error) {
        console.error(`Lỗi xử lý bid ${bid.id}:`, error);
        return null;
      }
    })
  );

  const validData = cleanedData.filter((result) => result !== null);

  if (validData.length > 0) {
    try {
      await fs.promises.writeFile(
        "./cleanedData.json",
        JSON.stringify(validData, null, 2)
      );
      console.log(
        `Xử lý thành công: ${validData.length}/${rawData.length} bản ghi`
      );
    } catch (error) {
      console.error("Lỗi khi ghi file:", error);
    }
  } else {
    console.log("Không có dữ liệu để lưu");
  }

  return validData;
};
