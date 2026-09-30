// import Tippy from '@tippyjs/react';
import tippy, {hideAll} from 'tippy.js'
// import 'tippy.js/dist/tippy.css'; // moved to index.html
// ======================================================
// 🔹 Config
// ======================================================

let UI_CONFIG = null;

export function initUI(config) {
  if (!config) {
    throw new Error("[ideUI] initUI(config) is required but received undefined/null");
  }

  if (typeof config.ToastDurationMs !== "number") {
    throw new Error("[ideUI] Missing or invalid 'ToastDurationMs' in config");
  }

  UI_CONFIG = config;
}

function getConfig() {
  if (!UI_CONFIG) {
    throw new Error("[ideUI] UI not initialized. Call initUI() first.");
  }
  return UI_CONFIG;
}

// ======================================================
// 🔹 Modal
// ======================================================

// ---------------------- public ------------------------

/**
 * Show the base modal dialog.
 */

export function uiShowModal(){
    document.getElementById("ideModal").showModal();
}

/**
 * Close the modal dialog.
 */

export function uiHideModal(){
    document.getElementById("ideModal").close();
}

/**
 * Show a confirm modal with Yes/No options.
 *
 * @param {string} message - Message to display.
 * @param {boolean} [preferNo=false] - If true, "No" is styled as the primary action.
 * @returns {Promise<boolean|null>} Resolves:
 *  - true  → Yes
 *  - false → No
 *  - null  → dismissed (ESC / close)
 *
 * @example
 * const ok = await uiShowConfirmModal("Delete?");
 * const cancelPreferred = await uiShowConfirmModal("Delete?", true);
 */

export function uiShowConfirmModal(message, preferNo = false) {
  const primaryValue = preferNo ? false : true;

  return renderModalElement(message, [
    {
      text: "Yes",
      value: true,
      variant: primaryValue === true ? "primary" : "secondary"
    },
    {
      text: "No",
      value: false,
      variant: primaryValue === false ? "primary" : "secondary"
    }
  ]);
}

/**
 * Show an alert modal with a single OK button.
 *
 * @param {string} message - Message to display.
 * @returns {Promise<boolean|null>} Resolves when closed.
 *
 * @example
 * await uiShowAlertModal("Saved!");
 */

export function uiShowAlertModal(message){
    return renderModalElement(
        message, 
        [
            { text: "OK", value: true, variant: "primary" },
        ]
    );
}

// ---------------------- private ------------------------ 

function renderModalElement(message, buttonItems = []) {
    const content = document.getElementById("modal-content");
    
    // clear old content
    // it effectively removes all event listeners from the child elements
    // ref: https://developer.mozilla.org/en-US/docs/Web/API/Element/replaceChildren
    content.replaceChildren();

    return new Promise((resolve) => {

        const wrapper = document.createElement("div");
        wrapper.className = "modal";

        const windowBox = document.createElement("div");
        windowBox.className = "modal-window";

        const titleEl = document.createElement("div");
        titleEl.className = "modal-title";
        titleEl.textContent = location.hostname + " says";

        const messageEl = document.createElement("div");
        messageEl.className = "modal-message";
        messageEl.textContent = message;

        const actions = document.createElement("div");
        actions.className = "modal-actions";

        buttonItems.forEach(item => {
            const btn = document.createElement("button");
            btn.textContent = item.text;

            btn.classList.add("modal-btn");
            btn.classList.add(
                item.variant === "primary"
                ? "modal-btn-primary"
                : "modal-btn-secondary"
            );

            btn.addEventListener("click", () => {
                resolve(item.value);   // return result
                uiHideModal();         // close modal
            }, { once: true });

            actions.appendChild(btn);
        });

        // handle press ESC
        document.getElementById("ideModal").addEventListener("close", () => {
            content.replaceChildren(); // clear DOM when closing
            resolve(null);
        }, { once: true });

        windowBox.append(titleEl, messageEl, actions);
        wrapper.appendChild(windowBox);
        content.appendChild(wrapper);

        uiShowModal();             // show modal
    });
}

// ======================================================
// 🔹 Tooltip
// ======================================================

// ---------------------- public ------------------------

/**
 * Attach a static tooltip to an element.
 *
 * @param {HTMLElement} element
 * @param {string} content - HTML/text content.
 * @param {string} [themeStyle] - Optional theme name (without "custom-" prefix).
 *   Falls back to "gray" if not provided or falsy.
 * @returns {Object} Tippy instance.
 */

export function mountStaticTooltip(element, content, themeStyle){
  return tippy(element, {
    trigger: 'mouseenter',
    allowHTML: true,
    interactive: false,
    arrow: false,
    theme: `custom-${themeStyle || 'gray'}`,
    hideOnClick: true,
    content: content,
  });
}

/**
 * Mount a dynamic tooltip that renders a status box.
 *
 * @param {HTMLElement} element
 * @param {(instance: TippyInstance) => { title: string, items: Array<{label: string, status?: string}> }} getData
 *   - Return tooltip data (NOT HTML)
 *   - Rendering is handled internally
 * @param {string} [themeStyle] - Optional theme name (without "custom-" prefix).
 *   Falls back to "gray" if not provided or falsy.
 *
 * @example
 * mountDynamicTooltip(btn, () => ({
 *   title: "Compile",
 *   items: [{ label: "Ready", status: "success" }]
 * }))
 */

export function mountDynamicTooltip(element, getData, themeStyle) {
  const tooltip = mountStaticTooltip(element, '', themeStyle);

  tooltip.setProps({
    onTrigger(instance) {
      if (!getData) return;

      const data = getData(instance);

      if (!data) return;

      const { title, items } = data;

      const html = uiRenderTooltipBox(title, items);
      instance.setContent(html);
    }
  });

  return tooltip;
}

// ---------------------- private ------------------------ 

function uiRenderTooltipBox(title, StatusItems = []) {
  try {
    let html = `<div class="tippy-status-container">`;

    html += `
      <div class="tippy-status-container-title">
        ${title}
      </div>
    `;

    StatusItems.forEach(({ label, status }) => {
      html += `
        <div class="tippy-upload-compile-item ${status || ''}">
          <span>${label}</span>
        </div>
      `;
    });

    html += `</div>`;

    return html;
  } catch (e) {
    console.log('Failed to render UI tooltip status box: ', e);
    return null;
  }
}

// ======================================================
// 🔹 Notification (using tippy tooltip)
// ======================================================

// ---------------------- public ------------------------ 

/**
 * Show a toast notification anchored to a DOM element.
 *
 * @param {HTMLElement} anchorElement - Element used as the anchor for positioning the toast.
 * @param {string | { text: string, status?: string }} message
 *   - string: simple text message
 *   - object: { text, status?: "success" | "error" | "gray" | string }
 * @param {Object} [options]
 * @param {string} [options.placement] - Toast placement relative to the anchor (e.g. "top", "bottom").
 * @param {number} [options.delay=0] - Delay before showing the toast (ms).
 * @param {number} [options.duration] - Auto-hide duration (ms). Defaults to config value.
 *
 * @example
 * showToastNotification(btn, "Saved!");
 * showToastNotification(btn, { text: "Failed", status: "error" });
 */

export function showToastNotification(anchorElement, message, options = {}) {
  const {
    placement,
    delay = 0,
    duration = getConfig().ToastDurationMs,
  } = options;

  // normalize message
  const {
    text,
    status = 'gray'
  } = typeof message === "string"
    ? { text: message}
    : message;

  const notificationTheme = `custom-${status}`;

  const popup = tippy(document.createElement('div'), {
    getReferenceClientRect: () => anchorElement.getBoundingClientRect(),
    trigger: 'manual',
    allowHTML: true,
    interactive: false,
    arrow: true,
    content: text,
    appendTo: document.body,
    theme: notificationTheme,
    ...(placement && { placement }),

    // onHide(instace){
    //   console.log("Hide toast pop-up Tooltip: ", {id: instace.id, content: instace.props.content});
    // },

    onShow(instance){
      hideAll({ exclude: instance });
    }
  });

  setTimeout(() => {

    // console.log("Show toast pop-up Tooltip:", {
    //   content: popup.props.content
    // });

    popup.show();

    setTimeout(() => {
      popup.destroy();
    }, duration);

  }, delay);
}

/**
 * Hides all currently visible toast notifications immediately.
 *
 * This is a convenience wrapper around `hideAll()` used specifically
 * for toast/notification instances created by the toast system.
 *
 * @example
 * uiHideAllToastNotification();
 */

export function uiHideAllToastNotification(){
  hideAll();
}
