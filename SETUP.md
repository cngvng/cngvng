# Hướng dẫn quản lý GitHub profile

Repo này là profile GitHub, không phải source website. README xuất hiện trên [github.com/cngvng](https://github.com/cngvng); portfolio được build riêng tại [cngvng.github.io](https://cngvng.github.io).

## 1. Profile hoạt động như thế nào?

- `README.md`: bio, research directions, paper/code và liên hệ.
- `assets/research-header.svg`: banner vector, chỉnh được text/màu/bố cục.
- `profile.config.json`: tài khoản, organization, repo loại trừ và public/private.
- `scripts/update-languages.mjs`: đọc GitHub Linguist qua GitHub CLI, phân trang đầy đủ, cộng byte và tạo card sáng/tối cùng JSON kiểm tra.
- `scripts/update-activity.mjs`: đọc contribution calendar từng năm kể từ khi tạo tài khoản, tính streak và tạo một khối activity có đồ thị 90 ngày. Không phụ thuộc endpoint streak bên ngoài.
- `.github/workflows/profile-languages.yml`: refresh mỗi ngày khoảng 09:17 giờ Việt Nam hoặc chạy thủ công; GitHub cron có thể chạy trễ.

Không cần Vercel hay npm install cho profile; không cần PAT để đọc repo public. Badge liên hệ dùng Shields.io; nội dung chính và card ngôn ngữ không phụ thuộc stats service bên ngoài.

## 2. Chạy thủ công trên GitHub

Vào **Actions → Update profile activity and languages → Run workflow → main**.

Workflow dùng `GITHUB_TOKEN` mặc định để đọc dữ liệu public và commit card bằng `github-actions[bot]`. Nó chỉ stage JSON và card ngôn ngữ/activity desktop/mobile sáng/tối, không tự sửa README hay website. Nếu một bước lấy dữ liệu thất bại, job không commit card mới.

## 3. Build local

Cài Node.js 22 và GitHub CLI:

```bash
gh auth login
git clone https://github.com/cngvng/cngvng.git
cd cngvng
node scripts/update-languages.mjs
node scripts/update-activity.mjs
```

Khi chỉ sửa màu/layout và muốn dùng lại dữ liệu có sẵn:

```bash
node scripts/update-languages.mjs --render-only
node scripts/update-activity.mjs --render-only
```

Đưa thay đổi lên profile:

```bash
git add README.md assets profile.config.json scripts .github .gitattributes SETUP.md
git commit -m "Update research profile"
git push
```

## 4. Organization nào được tính?

Biểu đồ **Languages across my projects** gộp source code từ repo cá nhân và đúng ba organization dự án do bạn sở hữu:

- [cngvng-research](https://github.com/cngvng-research)
- [cngvng-papers](https://github.com/cngvng-papers)
- [cngvng-tech](https://github.com/cngvng-tech)

**My project organizations** được thể hiện bằng ba link gọn dưới card, không dùng một panel lớn riêng. Các organization khác đã bị bỏ khỏi cấu hình và dữ liệu được tạo lại, không chỉ ẩn khỏi hình.

Chỉ repo public, non-fork được tính. Khi kiểm tra ngày 2026-10-23, ba organization này chưa có repo public non-fork đủ điều kiện; phần ngôn ngữ hiện đến từ repo cá nhân. Organization vẫn được cấu hình và repo public mới sẽ tự được bổ sung ở lần refresh sau. Không đổi notebook thành Python hoặc tự cộng private code vào tỷ lệ.

JSON giữ breakdown cá nhân/organization để kiểm tra; biểu đồ hiển thị tổng đã gộp. Muốn thay phạm vi, sửa `organizations` rồi chạy lại workflow.

## 5. Vì sao không còn card HTML 99%?

Card mới đọc dữ liệu hiện tại, không dùng cache của public stats service. Khi audit, repo cá nhân public trả về Python là chủ yếu và không có HTML. Chưa xác định được nguồn lịch sử của số HTML 99.36% trong ảnh cũ.

Thống kê dựa trên **byte source code ở default branch**, không phải số commit, giờ làm việc, độ thành thạo hay phần code do chính bạn viết. Fork bị loại để tránh đếm upstream. Website được loại theo tên trong `excludeRepositories`, không ép HTML thành Python và không ẩn ngôn ngữ nào.

Muốn tính cả website, bỏ tên website khỏi `excludeRepositories`. Nếu repo Python có HTML report được generate rất lớn, thêm đúng output path vào `.gitattributes` của repo đó:

```gitattributes
reports/generated/** linguist-generated=true
```

Chỉ đánh dấu file thực sự generate. `.gitignore` không chứa được rule Linguist. Repo website ignore `_site/`, còn `_site/** linguist-generated=true` nằm trong `.gitattributes`.

## 6. Private projects: tùy chọn, chưa bật

`includePrivate` hiện là `false`. `GITHUB_TOKEN` của profile không đọc được toàn bộ repo private ở các organization khác chỉ vì bạn là admin.

Nếu muốn công bố **tổng hợp ngôn ngữ từ private projects**:

1. Chuẩn bị GitHub App/token có quyền đọc metadata những repo cần tính, được organization/SSO chấp thuận nếu cần. Fine-grained PAT chỉ có một resource owner, không mặc nhiên dùng được cho nhiều organization.
2. Lưu credential phù hợp tại **Settings → Secrets and variables → Actions → New repository secret**, tên `GH_STATS_TOKEN`. Không đưa token vào README, config hoặc URL ảnh.
3. Đổi `includePrivate` thành `true`, chạy workflow. Token phải nhìn thấy toàn bộ phạm vi cần báo cáo. API có thể chỉ trả phần repo token được cấp; script không chứng minh được inventory private là đầy đủ.
4. Kiểm tra inventory trước khi mô tả kết quả là toàn bộ dự án. Muốn dùng nhiều GitHub App installation token riêng cần mở rộng cấp credential theo organization; bản mặc định không tự tạo App/PAT.

Script không ghi tên hoặc breakdown từng private repo vào JSON public; tỷ lệ và số lượng tổng hợp vẫn được công khai khi bật tùy chọn.

## 7. Tùy biến màu và trình bày

- Banner: nền `#0F172A` / `#172554`; blue `#60A5FA`, violet `#A78BFA`, teal `#5EEAD4`.
- Thứ tự: identity → research questions → selected paper/code → engineering practice → compact activity → optional languages.
- Activity hiển thị mặc định trong một card: tổng contribution, streak hiện tại/dài nhất, contribution năm hiện tại và sparkline 90 ngày. Research questions và selected work được rút thành bảng hai cột, để bổ sung activity mà không kéo dài README bằng nhiều ảnh lớn.
- Card ngôn ngữ nằm trong `<details>`, rộng tối đa 450 px, không có panel organization lặp lại. Với ba ngôn ngữ hiện tại, card cao 216 px; mobile dùng cùng layout gọn thay cho khung cũ 620 px.
- GitHub README không hỗ trợ CSS/JavaScript như website; dùng Markdown, bảng, SVG và `<picture>`.
- Có thể pin MoA-MDS, HERMES, BERT-VBD bằng **Customize your pins**. README đã có link cả ba.
- Publication status cần đồng bộ với portfolio; không tự coi preprint là accepted.

## 8. Đọc streak và contribution đúng phạm vi

Activity theo contribution calendar toàn tài khoản GitHub, không bị giới hạn bởi ba organization của biểu đồ ngôn ngữ. Dữ liệu bao gồm aggregate private/restricted contributions khi GitHub trả chúng theo visibility của profile; không truy cập hoặc công khai tên/nội dung private repo. Quy tắc này độc lập với `includePrivate` của thống kê source code.

Streak tính theo ngày UTC: có contribution thì tiếp tục chuỗi; nếu hôm nay chưa có contribution, kiểm tra chuỗi tới hôm qua. Longest streak và total lấy từ calendar từng năm, lọc date để không đếm trùng các tuần vắt qua hai năm. Mỗi tổng năm được đối chiếu với tổng API trước khi ghi card.

Contribution không đồng nghĩa commit: calendar còn gồm PR, issue, review và các loại activity được GitHub ghi nhận. `assets/activity.json` giữ số commit/PR/issue/review do API trả cho năm hiện tại và restricted aggregate riêng; không suy diễn toàn bộ restricted contributions thành commits. Vì vậy biểu đồ được ghi rõ **contributions per day**, không phải **commits per day**.

## Nguồn và profile tham khảo

- [Sebastian Raschka](https://github.com/rasbt/rasbt): bio ngắn, focus và link rõ.
- [Sebastián Ramírez](https://github.com/tiangolo/tiangolo): contribution cụ thể.
- [Sindre Sorhus](https://github.com/sindresorhus/sindresorhus): visual identity mạnh, được tiết chế ở bản học thuật này.
- [GitHub languages API](https://docs.github.com/en/rest/repos/repos#list-repository-languages).
- [GitHub Actions authentication](https://docs.github.com/en/actions/tutorials/authenticate-with-github_token).
- [PAT và giới hạn resource owner](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens).
- [GitHub Readme Stats](https://github.com/anuraghazra/github-readme-stats): README hiện hướng sang successor projects; profile này không dùng public instance cũ.
