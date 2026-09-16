# Social asset package

Profile and cover files are ready to upload. Post/status files are deliberate
editable templates: replace every bracketed placeholder in the SVG, then export
the final PNG. The bundled PNGs show the template structure and are not meant
to be posted with placeholder text.

The dark profile master is the default. The light master is an approved
alternate. Use the safe-area master only for QA; its guide rings are visible.

## X

| Use         | File                                                  | Size      | Safe-area note                                                  |
| ----------- | ----------------------------------------------------- | --------- | --------------------------------------------------------------- |
| Profile     | `x/intra-x-profile-400.{svg,png}`                     | 400×400   | Identity is inside the central 60% so circular cropping is safe |
| Header      | `x/intra-x-header-product-message-1500x500.{svg,png}` | 1500×500  | Default product message; keep content in the supplied guide     |
| Alternate   | `x/intra-x-header-text-light-1500x500.{svg,png}`      | 1500×500  | Text-light dark-field option                                    |
| Alternate   | `x/intra-x-header-mark-dominant-1500x500.{svg,png}`   | 1500×500  | Mark-led company option                                         |
| Square post | `x/intra-x-square-post-1080x1080.{svg,png}`           | 1080×1080 | Use the inset guide                                             |
| 16:9 post   | `x/intra-x-landscape-post-1600x900.{svg,png}`         | 1600×900  | Use the inset guide                                             |
| 4:5 post    | `x/intra-x-portrait-post-1080x1350.{svg,png}`         | 1080×1350 | Use the inset guide                                             |

X officially recommends 400×400 profile images and 1500×500 headers:
https://help.x.com/en/managing-your-account/common-issues-when-uploading-profile-photo

## Instagram

| Use           | File                                                       | Size      | Safe-area note                                              |
| ------------- | ---------------------------------------------------------- | --------- | ----------------------------------------------------------- |
| Profile       | `instagram/intra-instagram-profile-1080.{svg,png}`         | 1080×1080 | High-resolution upload master; circular-crop safe           |
| Square feed   | `instagram/intra-instagram-square-1080x1080.{svg,png}`     | 1080×1080 | Use the inset guide                                         |
| Portrait feed | `instagram/intra-instagram-portrait-1080x1350.{svg,png}`   | 1080×1350 | 4:5 master                                                  |
| Story         | `instagram/intra-instagram-story-1080x1920.{svg,png}`      | 1080×1920 | Keep primary content away from top/bottom controls          |
| Reel cover    | `instagram/intra-instagram-reel-cover-1080x1920.{svg,png}` | 1080×1920 | Design at 9:16; verify the profile-grid crop before posting |

The feed masters use standard 1:1 and 4:5 ratios; story/reel uses 9:16. Meta’s
Reels guidance favors 9:16 creative with key elements kept in the safe zone:
https://www.facebook.com/business/ads/facebook-instagram-reels-ads

## LinkedIn

| Use                 | File                                                        | Size      | Safe-area note                                |
| ------------------- | ----------------------------------------------------------- | --------- | --------------------------------------------- |
| Company logo        | `linkedin/intra-linkedin-page-logo-400.{svg,png}`           | 400×400   | Official recommended size; circular-crop safe |
| Product cover       | `linkedin/intra-linkedin-cover-product-1512x256.{svg,png}`  | 1512×256  | Default product positioning                   |
| Company cover       | `linkedin/intra-linkedin-cover-company-1512x256.{svg,png}`  | 1512×256  | Alternate company positioning                 |
| Square post         | `linkedin/intra-linkedin-square-post-1080x1080.{svg,png}`   | 1080×1080 | Use the inset guide                           |
| Landscape/link post | `linkedin/intra-linkedin-landscape-post-1200x627.{svg,png}` | 1200×627  | Official 1.91:1 link-image ratio              |

LinkedIn’s current Page help recommends 400×400 logos and 1512×256 company
covers, and its post guidance specifies 1200×627 for linked images:
https://www.linkedin.com/help/linkedin/answer/a570368

## WhatsApp

| Use          | File                                                       | Size      | Safe-area note                                     |
| ------------ | ---------------------------------------------------------- | --------- | -------------------------------------------------- |
| Profile      | `whatsapp/intra-whatsapp-profile-640.{svg,png}`            | 640×640   | Identity stays inside the central circle           |
| Status       | `whatsapp/intra-whatsapp-status-1080x1920.{svg,png}`       | 1080×1920 | Keep primary content away from top/bottom controls |
| Announcement | `whatsapp/intra-whatsapp-announcement-1080x1920.{svg,png}` | 1080×1920 | Editable status announcement                       |

WhatsApp does not publish a stable, authoritative pixel requirement for these
surfaces. These are high-resolution square and 9:16 working masters, documented
as package conventions rather than official mandates.

## Facebook and YouTube

| Platform | Use             | File                                                        | Size                    |
| -------- | --------------- | ----------------------------------------------------------- | ----------------------- |
| Facebook | Page profile    | `facebook/intra-facebook-page-profile-1080.{svg,png}`       | 1080×1080               |
| Facebook | Page cover      | `facebook/intra-facebook-page-cover-1640x624.{svg,png}`     | 1640×624 working canvas |
| Facebook | Post/story      | `facebook/intra-facebook-*.{svg,png}`                       | 1080 masters            |
| YouTube  | Channel profile | `youtube/intra-youtube-channel-profile-800.{svg,png}`       | 800×800                 |
| YouTube  | Channel banner  | `youtube/intra-youtube-channel-banner-2560x1440.{svg,png}`  | 2560×1440               |
| YouTube  | Thumbnail       | `youtube/intra-youtube-thumbnail-master-1280x720.{svg,png}` | 1280×720                |
| YouTube  | Video watermark | `youtube/intra-youtube-watermark-150.{svg,png}`             | 150×150 transparent     |

The Facebook cover is a documented 2× working canvas based on 820×312. Treat
it as a package convention and verify the crop in the live Page editor.

## Shared source assets

- `intra-og-1200x630.svg` is the editable share-card source.
- `intra-og-1200x630.png` is immediately usable as a static Open Graph image.
- Four ratio masters live in `master-formats/`.
- Platform crop guides live in `safe-areas/`.
- Ten content templates live in `../templates/social/`.

Do not upload SVG where a platform accepts only raster images; use the paired
PNG. Keep the SVG as the editable source.
