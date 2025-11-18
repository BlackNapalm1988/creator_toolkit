Hybrid Dark Studio UI – Master Plan
Overview and Goals

This master plan describes the steps required to modernize the Creator Toolkit’s front‑end to the Hybrid Dark Studio UI while preserving the underlying business logic. The current UI is defined mostly in Jinja templates (templates/base.html and templates/dashboard.html), vanilla JavaScript (static/app.js), and Tailwind‑like CSS (static/css/theme.css and static/css/app.css). The create view currently has all features (video creation, music generation, mastering) on a single page. Our goal is to:

Introduce a dark, cinematic theme inspired by professional editing suites.

Modularize the Create view into a hub with distinct sub‑modules (Video, Music, Mastering), accessible via secondary navigation.

Improve workspace switching visibility without changing backend behaviour.

Update modal copy to be clearer and less threatening.

Refactor UI components to use a consistent style with better spacing, cards, icons and inspector panel.

Leave all FastAPI endpoints and server‑side logic unchanged and test each UI change to ensure no regression.

1. Infrastructure & Feasibility
Current UI Structure

The base template defines a topbar with login/profile controls and a placeholder for the app root. It also includes modals for creating or switching workspaces
raw.githubusercontent.com
.

dashboard.html extends the base template and includes multiple <section> elements identified by view IDs such as dashboard-view, imagine-view, create-view, publish-view and system-view. Each view is initially hidden or shown by toggling classes via JS
raw.githubusercontent.com
.

The Create view is a single section containing three feature cards: video generation, music generation and final mastering
raw.githubusercontent.com
.

static/app.js builds a shell at runtime: a sidebar with nav items, a main workspace container and an inspector panel. The nav model defines view IDs and permitted roles
raw.githubusercontent.com
. The script attaches click handlers and persists collapsed sidebar state
raw.githubusercontent.com
.

Theme variables in static/css/theme.css define colours such as --primary, --secondary and --color3; however the variables are set with a reversed scheme (e.g., --white is dark and --dark is white)
raw.githubusercontent.com
.

Feasibility

Because the dashboard uses separate HTML sections for each view and the JS simply toggles them, it is feasible to split the Create view into multiple pages or modules without modifying backend routes. We can create new sections (e.g., create-video-view, create-music-view, create-mastering-view) and link them via secondary navigation.

All workspace actions (create, switch) and authentication flows are triggered via JS and rely on API endpoints; their UI can be restyled or repositioned without altering endpoint code
raw.githubusercontent.com
.

The theme variables are centralized; adjusting them or adding new variables will cascade across the site without touching logic. Additional CSS classes can provide more cinematic cards and shadows.

Because the branch phase-3-safe-pruning-user-folders-creation introduces safe pruning and workspace features, any modifications must not delete or rename HTML IDs used by existing JS. We should add new classes or wrappers but keep IDs to avoid breaking event handlers.

2. Implementation Scope

Each task below is scoped to front‑end templates, CSS, or JS only. They must be implemented iteratively, and after each step you should run the existing test suite and manually verify UI interactions. Checkboxes are provided for tracking.

2.1 Dark Studio Theme

Define colour palette variables.

Update static/css/theme.css to add variables for the hybrid dark palette (e.g., --background: #121315, --panel: #191B1F, --border: #2A2D32, --primary: #0A84FF, --success: #00D084, etc.) while keeping existing names for backwards compatibility
raw.githubusercontent.com
.

Add an .dark-studio class to apply these variables at the root element so that a user can switch themes via a single class.

✅ Verification: Load the app and confirm that backgrounds, text, borders and buttons reflect the new palette.

Refactor CSS components.

Create new component classes (e.g., .ct-card, .ct-tab, .ct-button-primary, .ct-button-secondary) that use the new variables and apply consistent padding, border‑radius and shadow. Use subtle gradients or inner shadows to achieve the cinematic look.

Replace hard‑coded colours in app.css with variable references or new classes. Avoid removing existing classes; instead, extend them for the dark theme.

✅ Verification: Check that cards, modals and the inspector adopt new styling without layout shifts.

Update typography and icons.

Ensure headings and body text use legible fonts (existing fonts Overlock and Prompt are retained but adjust weights and sizes if necessary).

Introduce icon fonts or SVG icons for nav items (video, music, mastering). Use an accessible library or embed simple SVGs.

✅ Verification: Inspect pages to confirm icons appear and text remains readable on dark backgrounds.

2.2 Shell & Navigation

Always display current workspace.

In static/app.js, modify renderShell to include a “current workspace” label in the top bar or sidebar header. It should read Workspace: <name> and clicking it should open the workspace menu. Use existing functions setWorkspaceTitle and workspaceMenu.

✅ Verification: After switching workspaces, the label updates immediately and persists across reloads via localStorage.

Secondary navigation for Create modules.

In dashboard.html, extract the Create page content into three new sections: create-hub-view (hub card grid), create-video-view, create-music-view, create-mastering-view.

At the top of each Create section, add a horizontal tab bar (buttons) labelled “Create Hub”, “Video”, “Music” and “Mastering”. Each button should call applyActiveView() with the corresponding view ID when clicked.

Update the nav model in static/app.js if necessary to include the new view IDs or manage them within the Create view using simple show/hide logic. Ensure that the main side nav still navigates to /create which loads the hub by default.

✅ Verification: From the Create hub, clicking “Video” shows only the video module, hides others and keeps the side nav unchanged. The browser URL may optionally update to /create/video but is not required.

Inspector panel adjustments.

Restyle the inspector panel (ct-inspector) to match the dark studio palette. Add a subtle border and background gradient.

Keep the existing JS controlling open/close states unchanged.

✅ Verification: The inspector remains functional and matches the new design.

Sidebar improvements.

Replace the burger/hamburger icon (🍔) used for collapsing the sidebar with a more appropriate icon (e.g., arrows). Use accessible aria-label attributes.

Increase the width of the sidebar for readability and adjust collapsed state to show only icons.

✅ Verification: Toggling the sidebar collapses and expands smoothly; nav items highlight the active view and tooltips appear on hover when collapsed.

2.3 Create Hub & Modules

Create hub cards.

In create-hub-view, implement a grid layout (CSS grid or flex) with card components representing Video Creation, Music Creation and Mastering. Each card should include a title, short description and a primary CTA button (Open Video, etc.).

The entire card should be clickable and call a function that activates the corresponding module view.

✅ Verification: Clicking anywhere on the card navigates to the appropriate module and the active tab updates.

Video module view (create-video-view).

Move the existing video prompt, duration, size and loop inputs and result preview into this view. Group related fields in panels and use the new card styles
raw.githubusercontent.com
.

Include a left column listing existing scenes or recent video jobs (optional for future expansion) and a right column for the active scene and controls.

✅ Verification: Generating a video still calls the same endpoints and the result appears in the preview area. The module can be accessed directly via tab or deep link.

Music module view (create-music-view).

Move the existing music prompt, duration, mood, genre inputs and result preview into this view
raw.githubusercontent.com
. Consider a list of previously generated tracks with play buttons.

✅ Verification: Music generation works as before and audio previews play.

Mastering module view (create-mastering-view).

Move the final video assembly controls (loop path, song path, voiceover path, build button, result preview) into this view
raw.githubusercontent.com
.

Design a timeline‑style panel where the user can select the loop video, drag in a music track, and optionally add overlays; this can be a future enhancement.

✅ Verification: Building a final video triggers the same endpoint and results appear correctly.

Routing & deep links.

Optionally update FastAPI routes to recognise /create/video, /create/music and /create/mastering as synonyms for /create, but if route changes require backend modifications this step can be deferred. For now, handle sub‑module switching entirely on the front end.

✅ Verification: Navigating directly to #/create-video-view (hash) loads the correct module after JS initialises.

2.4 Workspace UX Enhancements

Improve create/switch workspace modals.

In templates/base.html, add helper text beneath the workspace name input (e.g., “Use a descriptive project title”). Validate the name on the client (non-empty, trimmed).

Rewrite the Switch Workspace modal copy to reassure the user: “Switching will load that workspace’s prompts, assets and settings. Your current work remains saved.”
raw.githubusercontent.com
.

Make the “Cancel” button the default focus to avoid accidental acceptance.

✅ Verification: Attempt to create a workspace with an empty name; the modal displays an inline error and does not call the backend.

Archive vs delete (future).

The safe-pruning branch likely adds deletion of obsolete folders. In the UI, present separate actions: “Archive workspace” (hides from default lists) and “Delete workspace & folders” (only enabled after confirmation).

Show a checklist summarising how many prompts, scenes and jobs will be affected.

✅ Verification: Archiving removes the workspace from the list but leaves files on disk (check via API). Deleting triggers pruning and shows a success banner.

Workspace menu enhancements.

In static/app.js, populate the workspace dropdown (workspaceMenu) with last opened timestamps and optional descriptions.

Disable the currently active workspace in the list to prevent double clicking.

✅ Verification: The menu lists all available workspaces, indicates the current one and can be navigated via keyboard.

2.5 Modals & Copy

Update language for clarity.

Review all modal titles and button labels. Use verbs (e.g., “Create workspace”, “Switch workspace”) and clear descriptions. For example, rename the Create modal’s Create button to Create workspace and the Cancel button to Cancel
raw.githubusercontent.com
.

Ensure the Switch modal body clarifies what happens and reassure the user that no data will be lost by switching
raw.githubusercontent.com
.

✅ Verification: All modals display concise, friendly copy and CTAs.

Stacked banners and notifications.

Combine the email verification and password reset banners into a unified notification stack at the top of the page. Each banner should include a short description and a clear action button.

Use coloured accent bars (yellow for warnings, red for errors, blue for info).

✅ Verification: When both verification and password reset are required, both banners appear stacked and can be dismissed individually.

Toast notifications for actions.

Implement a toast/snackbar component that appears in the bottom right when actions succeed or fail (e.g., workspace created, video generated, file deleted). It should auto dismiss after a few seconds.

✅ Verification: Trigger actions and confirm toasts appear with correct messages and vanish.

2.6 Testing & Verification Strategy

Unit tests remain unchanged.

Running the pytest suite ensures that backend logic remains intact. Because only templates and CSS are changed, no tests should fail. Run make ci or pytest after each change to confirm.

✅ Verification: All tests pass.

Manual UI test plan.

Test flows for each role (admin, owner, editor, viewer) using seeded test users. Verify that navigation gating respects data-roles and that the new UI hides or shows features accordingly.

Complete a full workflow: create workspace → imagine prompt → generate video → generate music → master video → schedule for publishing. Ensure the new UI surfaces errors if endpoints fail but does not break.

✅ Verification: Document any issues and fix them before release.

Accessibility checks.

Use browser dev tools to run contrast and keyboard navigation audits. Ensure that all interactive elements have focus indicators and appropriate ARIA labels.

✅ Verification: The dark theme meets WCAG AA colour contrast guidelines.

Performance & responsiveness.

Load the app on different viewport sizes to ensure the new layouts collapse gracefully. Verify that cards wrap and sidebars can collapse on smaller screens.

✅ Verification: No horizontal scrolling is required on mobile; navigation remains usable.

2.7 Roll‑out and Backwards Compatibility

Feature flag for dark studio UI.

Introduce a configuration flag (e.g., USE_DARK_STUDIO_UI) in a global JS object or environment variable. When the flag is false, render the legacy UI; when true, apply the new classes and sections. This allows gradual roll‑out.

✅ Verification: Toggling the flag at runtime switches between themes without a full page reload.

Documentation updates.

Update the README and any onboarding docs to reflect the new UI layout, including screenshots of the Create hub and modules. Explain how to switch workspaces and navigate modules.

✅ Verification: The docs build successfully and show the correct images.

Regression fallback.

Keep the old create-view HTML section until the new modules are stable. Users can be switched back to the legacy view by toggling the feature flag or by visiting /legacy/create.

✅ Verification: Legacy view still functions and uses the existing styling.

3. Conclusion

The Creator Toolkit’s architecture makes it practical to implement the Hybrid Dark Studio UI as a front‑end overhaul without touching server logic. By following this master plan, you can incrementally implement a modern, modular user interface with clear user flows and maintain existing functionality. Each checklist item includes a verification step to ensure that the overhaul does not introduce regressions.