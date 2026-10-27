## Prod chạy trên VPS, tài liệu nằm ngoài repo

- Code + test ở local; **không chạy bản prod ở laptop**. Deploy: `git push origin main` rồi `vps release cangoctoado` (VPS `git pull` về `/srv/projects/cangoctoado`, build, chạy lại). Domain: https://cangoctoado.baodom.xyz (FE + `/api` + `/socket.io` cùng domain).
- Game khai báo vào dashboard chung https://admin.baodom.xyz qua `/admin-api` (`server/src/admin.ts`), key `cangoctoado`. `/admin-api` không bao giờ đi qua Caddy/Cloudflare.
- Mọi tài liệu, handoff, báo cáo lưu ở `~/Documents/MyDocs/Games/CanGocToaDo/` (không lưu trong repo).

## Tác giả

Mọi game do người dùng code ký tên **chungcake69** (biệt danh).
