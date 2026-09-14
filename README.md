<h1 align="center">UCP Smart Portal</h1>

<p align="center">
  Modern student portal experience, built for UCP students.<br/>
  Born from the frustration of navigating the default portal, it adds a customizable dashboard,<br>
  Glassmorphic theme, academic widgets, course updates, notifications, and other quality-of-life features.<br>
  This extension injects custom styles and UI tweaks such as dockbar, hidden legacy title bar, and refined modals.</br>
</p>

<p align="center">
  <img alt="Chrome MV3" src="https://img.shields.io/badge/Chrome-Manifest_V3-4285F4?logo=googlechrome&logoColor=white">
  <img alt="Javascript" src="https://img.shields.io/badge/Javascript-5.x-3178C6?logo=javascript&logoColor=white">
  <img alt="License" src="https://img.shields.io/badge/License-PolyForm_Noncommercial-blue">
</p>

<p align="center">
  <a href="#-installation" title="Install UCP Smart Portal: takes about a minute">
    <img alt="Install now" src="https://img.shields.io/badge/INSTALL_NOW-latest_release_%C2%B7_1_minute-6366f1?style=for-the-badge&labelColor=4338ca&logo=googlechrome&logoColor=white">
  </a>
  &nbsp;&nbsp;
  <a href="#-installation" title="Install UCP Smart Portal: takes about a minute">
    <img alt="Install now" src="https://img.shields.io/badge/INSTALL_NOW-latest_release_%C2%B7_1_minute-6366f1?style=for-the-badge&labelColor=4338ca&logo=firefox&logoColor=white">
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
> **Beta (3.6.0).** [WIP] Notification, Course Updates & Settings Page
> Extension is still experimental. Read [Known issues](#%EF%B8%8F-known-issues) first.

<br/>

## 📰 News

- **[v3.6.0](../../releases/tag/v3.6.0)** · *2026-09-21* [WIP] · **Dashboard widgets, Notifications, & Customization**<br/>
  At a glance attendance, next class, credit info, along with course updates regarding left assignments/assessments.

- **[v3.5.0](../../releases/tag/v3.5.0)** · *2026-06-20* · **Night/Dark Mode, New Timetable, & UI Improvements**<br/>
  Added support for Night/Dark Mode, add-your-own timetable (JSON), backup **export/import**, and lightweight update.

<sub>Full notes for every version live on the [**Releases**](../../releases) page.</sub>

<br/>


## ✨ Features

#### 🎨 UI & Customization
- Modern glassmorphic-inspired UI with a clean, student-focused dashboard.
- **Dark Mode & Night Mode** for a more comfortable viewing experience.
- Custom backgrounds with **blur, background color matching, and preset themes**.
- Fully customizable dashboard — choose which widgets, cards, and information are displayed.

#### 📊 Academic Dashboard
- At-a-glance **CGPA, credit hours, term progress, next class, and attendance** information.
- Course overview with **submissions, upcoming assessments, and make-up classes**.
- Customizable course cards with **course code, section, credit hours, and quick actions**.
- Quick-access buttons for gradebooks, announcements, course materials, assessments, and outlines.

#### 🔔 Notifications & Updates
- Centralized **Notifications & Updates** hub for academic calendar, portal news, course updates, miscellaneous announcements, and UCP feeds.
- Background **course-update scanning** to detect changes without manually checking every course.
- **Push notifications** for newly detected course updates.
- Filter course updates by **submissions, content, grades, or all updates**.
- Manual **Scan Now** and automatic background checks.

#### ⚙️ Personalization & Productivity
- **Stay Active** mode to prevent automatic portal logout.
- Customizable notification behavior, including **Instant Push** mode.
- Configurable dashboard widgets, cards, notification tabs, and default course actions.
- New enrollment interface with an alternative card-based layout.
- Local storage and cache controls for managing extension data.

#### 🚀 Lightweight
- Built as a browser extension that works directly on the existing UCP Smart Portal.
- Designed to enhance the existing portal without requiring a separate application.
- Focused on a lightweight, responsive experience with minimal friction for everyday student use.

## 🖼 Screenshots

<table>
  <tr>
    <td> <img width="1658" height="986" alt="BEFORE (dashboard" src="https://github.com/user-attachments/assets/29274e07-cd50-474d-a965-4f61aa51c70c" />
    Default UCP Portal's Student Dashboard
 </td>
    <td> <img width="1398" height="834" alt="AFTER" src="https://github.com/user-attachments/assets/3e6e3d6c-cbf2-41bf-b8a8-1ecc636e83bc" />
    UCP Smart Portal's Student Dashboard </td>
  </tr>
  <tr>
    <td> <img width="1750" height="943" alt="image" src="https://github.com/user-attachments/assets/683f06f8-e2c0-4208-9262-ac23263a8c79" />
    Default UCP Portal's Student Timetable
   </td>
    <td> <img width="1538" height="987" alt="image" src="https://github.com/user-attachments/assets/4fb9af05-3d01-44b5-8327-865ac6afa05c" />
    Redesigned Student Timetable w/ additional features  </td>
</tr>
  <tr>
    <td> <img width="1304" height="858" alt="image" src="https://github.com/user-attachments/assets/1d915fdd-2d5f-4599-a180-6b768c59be37" />
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

### Chromium Browsers (recommended) 

1. Grab `ucp-smart-portal-vX.X.X.zip` from the [**Releases**](../../releases) page.
2. Unzip it somewhere.
3. Open `chrome://extensions` in your browser.
4. Turn on **Developer mode** (top right).
5. Click **Load unpacked** and select the unzipped extension folder.
6. Open the UCP Smart Portal and log in. The extension will automatically apply its enhanced interface and features.

Alternatively, you can download the extension on [Chrome webstore](https://chromewebstore.google.com/detail/ucp-smart-odoo-portal/ebmcimlgnnbkomlabkhijkblmchjifid?hl=en&pli=1)

### Mozilla FireFox [WIP]

1. Grab `ucp-smart-portal-vX.X.X.zip` from the [**Releases**](../../releases) page.
2. Unzip it somewhere.
3. Open `about:debugging` in Firefox and select **This Firefox**.
4. Click **Load Temporary Add-on**.
5. Open the unzipped extension folder and select `manifest.json`.
6. Open the UCP Smart Portal and log in. The extension will automatically apply its enhanced interface and features.

> **Note:** Firefox temporary add-ons are removed when Firefox is restarted, so you'll need to load the extension again after restarting Firefox.


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
│ ├── course/ # Course-specific styles
│ ├── enrollment_nav.css
│ ├── homepage.css
│ ├── new_enrollment.css
│ ├── notification_page.css
│ ├── notification_widget.css
│ ├── portal_glass.css # Glassmorphic UI styling
│ ├── settings_page.css
│ ├── shell.css
│ ├── student.css
│ ├── student_attendance.css
│ ├── student_dashboard.css
│ ├── student_datesheet.css
│ ├── student_enrolled.css
│ ├── student_feedback.css
│ ├── student_invoices.css
│ ├── student_profile.css
│ ├── student_results.css
│ ├── student_societies.css
│ └── student_timetable.css
├── course_enrollment_ui.html # Redesigned course enrollment interface
├── manifest.json # Browser extension manifest
├── test.js # Development/testing utilities
├── README.md # Project documentation
├── LICENSE.md # Project license
└── vite.svg # Vite asset
```

## 🧩 How It Works
The extension matches UCP Odoo portal pages and injects:
- CSS (glassmorphic theme, layout fixes)
- JS (UI enhancements: dockbar, modals, cleanups)
No data leaves your browser; everything runs locally in the page context.
Runs locally, does not collect or share data. Fetches info from UCP Portal.


## 🔧 Development
- Edit files under `styles/` and `js/`.
- If you add new assets or scripts, ensure paths are correct in the injection logic and/or `manifest.json`.
- Keep CSS effects subtle to avoid readability issues (glassmorphism can reduce contrast).


## 🗺️ Roadmap
- Lightweight dark mode optimization 
- More Background options to complement design 
- Accessibility pass (contrast, keyboard nav)
- Performance profiling on low-end machines


## ⚠️ Known issues

This is a `3.6.0` beta, so expect some rough edges. The extension otherwise works as expected.

- **Settings page buttons** are currently broken, clicking them does nothing. The **toggles still work normally**, and the settings page can still be navigated using the keyboard.
- **Notifications** are currently a **work in progress** and may not function reliably yet.
- No other known issues at the moment, above issues will be fixed in v3.6.2.

<br/>


## 🙏 Attributions

-  Design - Abdurrehman, AbuBakr Aslam
-  Web Scraping - Talha Abid
-  Code - Abdullah Zafar, AbuBakr Aslam
</br>
By UCP Students with love for UCP students.
