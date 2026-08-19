# Pilgrim Board — Google Apps Script 연동

게시판(`community.html`)이 개인 노트북 터널 대신 구글 시트를 데이터 저장소로 쓰도록 바꾼 백엔드입니다.

## 설정 방법

1. [sheets.google.com](https://sheets.google.com)에서 새 스프레드시트를 만듭니다. (이름은 자유롭게, 예: `MuniBed Comments`)
2. 메뉴에서 **확장 프로그램 > Apps Script**를 클릭합니다.
3. 기본으로 열려있는 `Code.gs` 내용을 지우고, 이 폴더의 [Code.gs](Code.gs) 내용 전체를 붙여넣습니다.
4. 저장(Ctrl/Cmd+S) 후, 우측 상단 **배포 > 새 배포**를 클릭합니다.
5. 유형 선택에서 톱니바퀴를 누르고 **웹 앱**을 선택합니다.
   - 실행 계정: **나(본인 계정)**
   - 액세스 권한이 있는 사용자: **모든 사용자**
6. **배포**를 누르면 처음엔 구글 계정 권한 승인 화면이 뜹니다. 본인 계정으로 승인해주세요.
7. 배포가 끝나면 `https://script.google.com/macros/s/xxxxx/exec` 형태의 **웹 앱 URL**이 나옵니다. 이 URL을 복사합니다.
8. 아래 두 파일에서 `REPLACE_WITH_YOUR_DEPLOYMENT_ID` 부분을 방금 복사한 URL로 교체합니다.
   - `docs/community.html` (GitHub Pages에 실제 배포되는 버전)
   - `api/public/community.html` (Railway/Render용 서버 버전)

## 참고

- 시트에 `Comments`라는 탭이 자동으로 생성되고, `Id / Timestamp / Nickname / Content / CreatedAt / PasswordHash` 6개 열에 글이 쌓입니다.
- 글쓴이가 입력한 비밀번호는 평문이 아니라 SHA-256 해시로만 저장됩니다. 본인 글은 그 비밀번호를 다시 입력해야 삭제할 수 있어요.
- 이후 Apps Script 코드를 수정하면, 배포 화면에서 **배포 관리 > 수정(연필 아이콘) > 새 버전**으로 다시 배포해야 반영됩니다. (URL은 그대로 유지됩니다.)
- 스팸/욕설 방지 같은 별도 검수는 없으니, 필요하면 시트에서 직접 행을 삭제해 관리하면 됩니다.

### 열 구조가 바뀌었어요 (4열 → 6열)

이전 버전은 `Timestamp / Nickname / Content / CreatedAt` 4열이었는데, 이번에 `Id`와 `PasswordHash`가 추가되면서 6열로 바뀌었습니다. **기존에 테스트로 쌓인 데이터가 시트에 남아있다면, 재배포 전에 헤더 행(1행)을 제외한 데이터 행을 전부 지워주세요.** 열이 밀려서 예전 글들이 깨져 보이게 됩니다.
