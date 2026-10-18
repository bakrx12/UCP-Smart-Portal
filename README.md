<h1 align="center">UCP Smart Portal</h1>

<p align="center">
  Modern student portal experience, built by UCP Student for UCP students.<br/>
  Born from the frustration of navigating default portal's inscrutable timetable <br>
  Redesigned UI, widgets, course notifications, and other quality-of-life features.<br>
</p>

<p align="center">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Javascript" src="https://img.shields.io/badge/Javascript-5.x-3178C6?logo=javascript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-PolyForm_Noncommercial-blue">
</p>

<p align="center">
  <a title="Install UCP Smart Portal: takes about a minute">
    <img alt="Install now" src="https://img.shields.io/badge/INSTALL_NOW%C2%B7_1_minute-6366f1?labelColor=4338ca&logo=googlechrome&logoColor=white"> </a>
  &nbsp;&nbsp;
  <a href="https://addons.mozilla.org/en-US/firefox/addon/ucp-smart-portal/" title="Install UCP Smart Portal: takes about a minute">
    <img alt="Install now" src="https://img.shields.io/badge/INSTALL_NOW%C2%B7_1_minute-6366f1?labelColor=4338ca&logo=firefox&logoColor=white">
  </a>
</p>

<p align="center">
  <a href="#-news">News</a> &nbsp;·&nbsp;
  <a href="#-features">Features</a> &nbsp;·&nbsp;
  <a href="#-screenshots">Screenshots</a> &nbsp;·&nbsp;
  <a href="#-installation"><b>Install</b></a> &nbsp;·&nbsp;
  <a href="#-architecture">Project Structure</a> &nbsp;·&nbsp;
  <a href="#-known-issues">Known issues</a> &nbsp;·&nbsp;
  <a href="#-roadmap">Roadmap</a> &nbsp;·&nbsp;
  <a href="#-attributions">Attributions</a>
</p>

<br/>

> [!WARNING]
> [**v3.6**] Device Notifications for course updates are still work-in-progress <br>
> Read [Known issues](#%EF%B8%8F-known-issues) first before installing the extension.

<br/>

## 📰 News

- **[v3.6.0](../../releases/tag/v3.6.0)** · **Improved Dashboard, widgets, & Settings Customization**<br/>
  At a glance attendance, next class, credit info, along with course updates regarding left assignments/assessments.

- **[v3.5.0](../../releases/tag/v3.5.0)** · **Night/Dark Mode, New Timetable, & UI Improvements**<br/>
  Added support for Night/Dark Mode, add-your-own timetable (JSON), backup **export/import**, and lightweight update.

<sub>Full notes for every version live on the [**Releases**](../../releases) page.</sub>

<br/>


## ✨ Features

#### 🎨 UI & Customization
- Modern glassmorphic-inspired UI with a customizable, student dashboard.
- Custom backgrounds with **blur, background color matching, and preset themes**.

#### 📊 Academic Dashboard
- At-a-glance **CGPA, credit hours, term progress, next class, and attendance** information.
- Shows Active course **submissions, upcoming assessments,** and upcoming **make-up classes**.
- **Quick-access right-click menu** for gradebook, announcement, material, assessments, and outline.

#### 🔔 Notifications & Updates
- Centralized **Notifications & Updates** hub for academic calendar, portal news, course updates, and UCP feeds.
- Background **course-update scanning** to detect changes without manually checking every course.

#### ⚙️ Personalization & Productivity
- **Stay Active** mode to prevent automatic portal logout.
- Customizable notification behavior, widget, cards, and default course actions.

#### 🚀 Lightweight
- Built as a browser extension that works directly on the existing UCP Smart Portal.
- Focused on a lightweight, responsive experience with minimal friction for everyday student use.

## 🖼 Screenshots

<table>
  <tr>
    <td> <img width="1658" height="986" alt="BEFORE (dashboard" src="https://github.com/user-attachments/assets/29274e07-cd50-474d-a965-4f61aa51c70c" />
    Default UCP Portal's Student Dashboard
 </td>
    <td> <img width="1653" height="991" alt="image" src="https://github.com/user-attachments/assets/b574fa7c-45bb-49e0-895e-477a0ad2c2a2" />
    UCP Smart Portal's Student Dashboard </td>
  </tr>
  <tr>
    <td> <img width="1750" height="943" alt="image" src="https://github.com/user-attachments/assets/683f06f8-e2c0-4208-9262-ac23263a8c79" />
    Default UCP Portal's Student Timetable
   </td>
    <td> <img width="1647" height="992" alt="image" src="https://github.com/user-attachments/assets/a5011585-e87e-47fc-900a-562a9524b895" />
    Redesigned Student Timetable w/ additional features  </td>
</tr>
   
  <tr>
    <td> <img width="1529" height="988" alt="image" src="https://github.com/user-attachments/assets/ee582380-0b91-4635-96b7-cda7e9f53761" />
      Dashboard featuring Academic Calendar & much more </td>
        <td> <img width="1392" height="935" alt="image" src="https://github.com/user-attachments/assets/e33ded8a-19e2-4b17-9277-e57875bc8676" />
    Setting Background customization </td>

</tr>
  </tr>
  <tr>
    <td> <img width="1478" height="912" alt="image" src="https://github.com/user-attachments/assets/3261629d-8f50-4014-94b8-29331e4ffa78" />
      Result & Exam page showing active courses </td>
    <td> <img width="1534" height="871" alt="image" src="https://github.com/user-attachments/assets/0a898701-d287-4706-a70f-3bcbdaaa6fbf" />
    Background Notification for course updates </td>
</tr>


  
</table>


## 🚀 Installation

### Chromium Browsers 

#### Latest release (via GitHub)
1. Grab `ucp-smart-portal-vX.X.X.zip` from the [**Releases**](../../releases) page.
2. Unzip it somewhere.
3. Open `chrome://extensions` in your browser.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped extension folder.
6. Open the UCP Smart Portal and log in. The extension will automatically apply its enhanced interface and features.

#### Chrome Web Store
Alternatively, you can download the extension on [Chrome webstore](https://chromewebstore.google.com/detail/ucp-smart-odoo-portal/ebmcimlgnnbkomlabkhijkblmchjifid?hl=en&pli=1). (OLD VERSION)

### Mozilla FireFox

#### FireFox Browser Add-ons
Download the extension from official [Morzilla FireFox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/ucp-smart-portal/) page.

#### Latest release (via GitHub)
1. Grab `ucp-smart-portal-vX.X.X.zip` from the [**Releases**](../../releases) page.
2. Unzip it somewhere. Delete `manifest.json` file.
3. Rename `manifest_firefox.json` to `manifest.json`
4. On FireFox Add-ons, click gear icon & select "Install Add-on from file"
5. Select `manifest.json` from the extension folder and it will automatically load extension.
6. Open the UCP Smart Portal and log in. The extension will automatically apply its enhanced interface and features.


## 📁 Architecture
Project structure for UCP Smart Portal
```
UCP-Smart-Portal/
├── assets/ # Portal assets, backgrounds, logos, and images
│ ├── bgs/ # Background images and presets
│ ├── homepage/ # Homepage-related assets
│ ├── barcode.png # Student barcode asset
│ ├── ucp_building.png # UCP building image
│ └── ucp_logo.png # UCP logo
├── background/ # Background/service-worker functionality
├── icons/ # Extension icons
├── js/ # JavaScript modules for portal pages and features
│ ├── course/ # Course-specific functionality
│ │ ├── course_gradebook.js
│ │ ├── course_material.js
│ │ ├── course_submission.js
│ │ ├── dockbar.js
│ │ ├── FileSaver.min.js
│ │ └── jszip.min.js
│ ├── academic_calendar.js # Academic calendar integration
│ ├── enrollment_nav.js # Enrollment navigation
│ ├── enrollment_timetable.js
│ ├── homepage.js # Dashboard/homepage functionality
│ ├── new_enrollment.js # Redesigned enrollment interface
│ ├── notification_page.js # Notifications and updates
│ ├── session_expire.js # Session/auto-logout handling
│ ├── settings_page.js # Extension settings
│ ├── shell.js # Shared portal shell/navigation
│ ├── student.js # Shared student functionality
│ ├── student_attendance.js # Attendance information
│ ├── student_dashboard.js # Custom academic dashboard
│ ├── student_datesheet.js # Exam datesheet
│ ├── student_enrolled.js # Enrolled courses
│ ├── student_feedback.js # Feedback interface
│ ├── student_invoices.js # Invoice information
│ ├── student_profile.js # Student profile
│ ├── student_results.js # Results and grades
│ ├── student_societies.js # Societies
│ └── student_timetable.js # Student timetable
├── styles/ # CSS styles for redesigned portal pages
├── manifest.json # Browser extension manifest
├── README.md # Project documentation
└── LICENSE.md # Project license
```

## 🧩 How It Works
The extension matches UCP Odoo portal pages and authenticates client-side web scraping of UCP Horizon through browser-native Fetch requests. Retrieved HTML is parsed using DOMParser and CSS selectors within content scripts, while the background service worker uses regex-based raw-HTML extraction where DOM APIs are unavailable. Extracted course data is persisted as snapshots in Browser's Storage and periodically polled using Alarms, with differential comparison used to detect new submissions, materials, and grade changes and trigger browser notifications.

No data leaves your browser; everything runs locally in the page context.
Runs locally, does not collect or share data. Fetches info from UCP Portal.


## 🔧 Development
- Edit files under `styles/` and `js/`.
- If you add new assets or scripts, ensure paths are correct in the injection logic and/or `manifest.json`.
- Keep CSS effects subtle to avoid readability issues (glassmorphism can reduce contrast).


## 🗺️ Roadmap
- Mobile Phone Support (PWA / Responsive Design)
- Accessibility pass (contrast, keyboard nav)
- Performance profiling on low-end machines


## ⚠️ Known issues

This is a `3.6`, The extension otherwise works as expected.
Any kind of contribution will be appreciated!

- **Notifications** are currently a **work in progress** and may not function reliably yet.

<br/>


## 🙏 Attributions

<p align="center">
  Abdurrehman · Talha Abid · Abdullah Zafar · AbuBakr Aslam
</p>
