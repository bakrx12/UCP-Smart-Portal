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
    <td> <img width="1662" height="987" alt="image" src="https://github.com/user-attachments/assets/46ce6789-6d57-42a2-822b-71997b2d7ea3" />
    Smart UCP Portal's Student Dashboard </td>
  </tr>
  <tr>
    <td> <img width="1750" height="943" alt="image" src="https://github.com/user-attachments/assets/683f06f8-e2c0-4208-9262-ac23263a8c79" />
    Default UCP Portal's Student Timetable
   </td>
    <td> <img width="1593" height="984" alt="image" src="https://github.com/user-attachments/assets/96dd7a5a-34bb-4f07-82f7-531c8a859f58" />
    Redesigned Student Timetable  </td>
</tr>


  </tr>
  <tr>
    <td> <img width="1172" height="862" alt="image" src="https://github.com/user-attachments/assets/4f71d4a2-5b7f-4607-915a-4fac22a85571" />
    Default UCP Portal's Course Overview
   </td>
    <td> <img width="1609" height="990" alt="image" src="https://github.com/user-attachments/assets/e19371da-b793-4eb8-a99e-06752641eb9f" />
    At a glance Course Overview, with performance shown in graphs </td>
</tr>

  </tr>
  <tr>
    <td> <img width="1050" height="697" alt="image" src="https://github.com/user-attachments/assets/45536169-7c58-44b7-8de0-1e108628e78e" />
    Default UCP Portal's Course Assessment 
   </td>
    <td> <img width="1606" height="986" alt="image" src="https://github.com/user-attachments/assets/bbdad921-bc35-4b27-a751-69c2639c507c" />
    Smart UCP Portal's Redesigned version </td>
</tr>
  
</table>

<img width="1415" height="987" alt="image" src="https://github.com/user-attachments/assets/0f762ff5-7b16-437a-917d-c11374c6bbd6" />
<img width="1456" height="982" alt="image" src="https://github.com/user-attachments/assets/c5db00d8-2e24-49d5-be37-e8115022310b" />


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
