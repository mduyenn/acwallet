# Hướng dẫn verify smart contract trên ArcScan Testnet

> **Trạng thái: Tất cả 15 contract đã được verify thành công trên ArcScan** (01/09/2026).
> Xem trực tiếp tại mục 4 — mỗi địa chỉ đều có tick xanh "Contract Source Code Verified" trên https://testnet.arcscan.app

## 1. Chuẩn bị source code

Đã có 2 file source chuẩn trong thư mục `contracts/`:

- `contracts/BillReceiver.sol`
- `contracts/YieldVault.sol`

## 2. Thông số compile chính xác

| Thông số | Giá trị |
|----------|---------|
| Compiler | Solidity `0.8.20` |
| License | MIT |
| Optimization | **Enabled** |
| Runs | `200` |
| EVM Version | default (London/Shanghai tùy compiler) |
| Source type | Single file |

## 3. Cách verify từng contract

### Bước 1: Mở trang contract trên ArcScan

Ví dụ:
```
https://testnet.arcscan.app/address/0xc75fc2669a2d4816b89b61a063866e043bb5d8d9
```

### Bước 2: Vào tab Verify

- Chọn tab **Contract**
- Bấm **Verify & Publish** (hoặc "Is this a proxy?" → "Verify contract")

### Bước 3: Điền thông số

- **Compiler Type:** Solidity (Single file)
- **Compiler Version:** `v0.8.20`
- **Open Source License Type:** `MIT`
- **Optimization:** `Yes`
- **Optimization Runs:** `200`

### Bước 4: Dán source code

- Mở file `contracts/BillReceiver.sol` hoặc `contracts/YieldVault.sol`
- Copy toàn bộ nội dung
- Dán vào ô **Enter the Solidity Contract Code**

### Bước 5: Constructor arguments

Các contract đều có constructor nhận 1 tham số `string`:

- `BillReceiver(string _billId)`
- `YieldVault(string _strategyId)`

ArcScan thường tự động nhận diện constructor arguments từ transaction deploy. Nếu không, bạn cần nhập dạng ABI-encoded, ví dụ:

- `"electric"` → `0x00000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000000000000000009656c656374726963000000000000000000000000000000000000000000000000`

Có thể dùng tool online như [abi.hashex.org](https://abi.hashex.org) để encode chuỗi string.

### Bước 6: Submit

Bấm **Verify and Publish**. Nếu đúng source + đúng thông số, ArcScan sẽ hiển thị tick xanh "Contract Source Code Verified".

## 4. Danh sách contract cần verify

### BillReceiver (9 contract)

| Dịch vụ | Địa chỉ | Constructor arg |
|---------|---------|-----------------|
| Electricity | `0xc75fc2669a2d4816b89b61a063866e043bb5d8d9` | `"electric"` |
| Water | `0xa58ec21a75874325435754c85296f67f35619844` | `"water"` |
| Internet | `0x32fe4d4adff3a62c2c2b7f40796c7031fcf529ee` | `"internet"` |
| Phone | `0x797a8af5a6e93fbde9f58c01c49eaa19735a7712` | `"phone"` |
| Netflix | `0x8a5947bdc5406644ef497ad3805b8f984f2209cc` | `"netflix"` |
| Spotify | `0x18173756ea87123270606cfd5fe758f0e1849e19` | `"spotify"` |
| Steam | `0x4532a17735c1a6886818b2b288dae5b68fb2a54e` | `"steam"` |
| Google Play | `0x5ffd8a532106bddbcb9ae69ae3b72a3c41b13341` | `"google"` |
| Apple | `0x9869011005647a88dda7c864358041d05675ff38` | `"apple"` |

### YieldVault (6 contract)

| Chiến lược | Địa chỉ | Constructor arg |
|------------|---------|-----------------|
| Aave v3 USDC | `0xd16f65fa6d0df3ea8104a1b67431371e973346f7` | `"aave-usdc"` |
| Morpho USDC | `0x87911cd75fb18d1b49a561be34037b4c6ea8d6dc` | `"morpho-usdc"` |
| Spark / Sky DAI | `0xba95ac280f0e6954581cbd33dc1844a8a229c968` | `"spark-dai"` |
| Compound v3 USDC | `0xe5a058545a4a7c606d78d4522ee99f88e2932307` | `"compound-usdc"` |
| Pendle fixed yield | `0xb2db09c5096042a60b5aa7f76d39c16920f2a00a` | `"pendle-fixed"` |
| Arc Testnet pool | `0xd44d0e893026f43403770d1aedea0cba254d1060` | `"arc-staking"` |

## 5. Lưu ý quan trọng

- Nếu ArcScan hỗ trợ **Standard JSON Input**, bạn có thể dùng output compile từ `solc` trong `scripts/deploy.mjs` để verify chính xác hơn.
- Nếu verify bị lỗi "Bytecode mismatch", kiểm tra lại:
  - Đúng compiler version
  - Đúng optimizer runs (200)
  - Đúng constructor arguments
  - Không có khoảng trắng/thụt đầu dòng khác biệt so với lúc deploy

## 6. Deployer wallet

- **Deployer:** `0xf14d0b2d149918f627411ca35143e56ace90e8a5`
- **Network:** Arc Testnet (Chain ID 5042002)
- **RPC:** https://rpc.testnet.arc.network
- **Explorer:** https://testnet.arcscan.app
