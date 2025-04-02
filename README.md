# Data Normalization Project

Dự án này được thiết kế để chuẩn hóa dữ liệu, giúp chuyển đổi và xử lý dữ liệu từ các định dạng khác nhau sang một định dạng chuẩn thống nhất.

## Mục đích

- Chuẩn hóa dữ liệu từ các nguồn khác nhau
- Xử lý và chuyển đổi dữ liệu sang định dạng chuẩn
- Tạo quy trình làm việc hiệu quả cho việc xử lý dữ liệu

## Yêu cầu hệ thống

- Node.js (phiên bản 14.0.0 trở lên)
- npm hoặc yarn

## Cài đặt

1. Clone dự án về máy local:

```bash
git clone https://github.com/minh-dev1801/msc_data_normalization.git
cd msc_data_normalization
```

2. Cài đặt các dependencies:

```bash
npm install
```

3. Cấu hình môi trường:

- Copy file `.env.example` thành `.env`
- Điền các thông tin cấu hình cần thiết vào file `.env`

## Sử dụng

1. Chạy dự án ở môi trường development:

```bash
npm run dev
```

2. Lấy dữ liệu:

- Chạy lệnh để lấy dữ liệu loại Firewall và trạng thái toàn bộ
- Dữ liệu đã được chuẩn hóa sẽ được lưu trong file `cleanedData.json`
- Kiểm tra dữ liệu trong file `cleanedData.json` trước khi thêm vào database

## Cấu trúc dữ liệu

Dữ liệu sau khi chuẩn hóa sẽ được lưu trong file `cleanedData.json` với định dạng:

```json
{
  "firewall": {
    // dữ liệu firewall đã chuẩn hóa
  },
  "status": {
    // trạng thái toàn bộ đã chuẩn hóa
  }
}
```

## Đóng góp

Mọi đóng góp đều được chào đón. Vui lòng tạo issue hoặc pull request để đóng góp vào dự án.

## Giấy phép

MIT License
