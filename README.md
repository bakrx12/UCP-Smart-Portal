# UCP Smart Portal

Glassmorphic Style Redesign of UCP’s Odoo Student Portal—clean, modern, and easier on the eyes. This extension injects custom styles and UI tweaks (dockbar, hidden legacy title bar, refined modals) to make everyday student workflows smoother.

## ✨ Features
- Glassmorphic UI Theme
- Dockbar support for quicker navigation
- Hidden old title bar for cleaner layout
- Improved course info, outline, and assessment views
- Polished course material, timetable, gradebook style
- Lightweight: pure HTML/CSS/JS, no frameworks

## 🖼 Screenshots

<table>
  <tr>
    <td> <img width="1658" height="986" alt="BEFORE (dashboard" src="https://github.com/user-attachments/assets/29274e07-cd50-474d-a965-4f61aa51c70c" />
    Default UCP Portal's Student Dashboard
 </td>
    <td> <img width="1836" height="990" alt="AFTER (dashboard)" src="https://github.com/user-attachments/assets/46d55316-1761-4804-a88f-e02663db436f" />
    Smart UCP Portal's Student Dashboard </td>
  </tr>
  <tr>
    <td> <img width="1750" height="943" alt="image" src="https://github.com/user-attachments/assets/683f06f8-e2c0-4208-9262-ac23263a8c79" />
    Default UCP Portal's Student Timetable
   </td>
    <td> <img width="1665" height="987" alt="image" src="https://github.com/user-attachments/assets/7a7b8475-ecdb-4435-8503-e0fb2205ed14" />
    Redesigned Student Timetable  </td>
</tr>

  </tr>
  <tr>
    <td> <img width="1050" height="697" alt="image" src="https://github.com/user-attachments/assets/45536169-7c58-44b7-8de0-1e108628e78e" />
    Default UCP Portal's Course overview
   </td>
    <td> <img width="1606" height="986" alt="image" src="https://github.com/user-attachments/assets/bbdad921-bc35-4b27-a751-69c2639c507c" />
    At a glance overview, with graph and much more  </td>
</tr>
  
</table>


<img width="1636" height="987" alt="image" src="https://github.com/user-attachments/assets/03f32e63-a56e-4840-8165-b36674e4da80" />
<img width="1504" height="982" alt="image" src="https://github.com/user-attachments/assets/74a9636b-fdcd-46c7-8d24-3071ef065919" />

## 📁 Project Structure
```
ucp-redesign-extension/
├─ assets/          # images, fonts, static assets
├─ icons/           # extension icons
├─ js/              # scripts injected into portal pages
├─ styles/          # CSS stylesheets (glassmorphism)
├─ index.html       # base page (dev/testing)
├─ calendea.html    # calendar view (dev/testing)
├─ manifest.json    # browser extension manifest (v3)
└─ vite.svg         # asset (legacy/test)
```

## 🧩 How It Works
The extension matches UCP Odoo portal pages and injects:
- CSS (glassmorphic theme, layout fixes)
- JS (UI enhancements: dockbar, modals, cleanups)
No data leaves your browser; everything runs locally in the page context.

## 🚀 Installation (Chrome / Edge)
1. Download or clone this repo.
2. Go to `chrome://extensions` (or Edge → Extensions).
3. Toggle “Developer mode” (top right).
4. Click “Load unpacked” and select the project folder.
5. Open the UCP Odoo Student Portal. Refresh to apply styles.

## 🔧 Development
- Edit files under `styles/` and `js/`.
- If you add new assets or scripts, ensure paths are correct in the injection logic and/or `manifest.json`.
- Keep CSS effects subtle to avoid readability issues (glassmorphism can reduce contrast).

## 🧪 Testing Checklist
- Verify navbar/dockbar renders correctly on:
  - Dashboard
  - Course detail (info, outline, assessments)
  - Calendar / materials modal
- Check dark/light backgrounds for contrast and legibility.
- Test on different zoom levels (90–125%).
- Confirm no layout overlaps on smaller screens (≤1366px width).

## 🛡 Privacy & Permissions
- Runs locally, does not collect or share data.
- Only requests permissions necessary to style UCP portal pages.

## 💡 Customization
- Adjust blur/opacity in `styles/*.css`:
  - `backdrop-filter: blur(10px);`
  - `background: rgba(255, 255, 255, 0.15);`
- Tweak shadows and borders for better contrast:
  - `box-shadow: 0 8px 24px rgba(0,0,0,0.15);`
  - `border: 1px solid rgba(255,255,255,0.25);`

## 🗺️ Roadmap
- Dark mode polish
- Accessibility pass (contrast, keyboard nav)
- Per-page toggles (enable/disable features)
- Performance profiling on low-end machines

## 🤝 Contributing
PRs welcome! Please:
1. Open an issue describing the change.
2. Keep changes scoped and documented.
3. Test across key pages before submitting.

## 📄 License
Private repository. If you want to use or adapt this, contact the maintainer for permission.

## 🙌 Credits
### Design - Abdurrehman
### Web Scraping - Talha Abid
### Code - Abdullah Zafar, AbuBakr Aslam
Retouched original, optimized to be lightweight.
By UCP Students with love for UCP students.
