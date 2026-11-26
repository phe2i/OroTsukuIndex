let toastTimer = null;

window.showToast = function (container = document, icon = "", message = "", status = "message", position = "bottom") {

    let toastClass, messageClass, iconClass

    if (status == "error") {
        messageClass = "error-text";
        if (icon == "") { iconClass = "error"; }
    } else if (status == "success") {
        messageClass = "success-text";
        if (icon == "") { iconClass = "check_circle"; }
    } else if (status == "message") {
        messageClass = "message-text";
        if (icon == "") { iconClass = "notifications"; }
    }
    
    if (icon != "") {
        iconClass = icon;
    }

    if (position == "bottom") {
        toastClass = "toast-bottom";
    }

    let toast = container.querySelector(`.${toastClass  ?? "toast-bottom"}`);

    if (!toast) {
        console.log("no toast");
        toast = document.createElement("div");
        toast.className = `${toastClass  ?? "toast-bottom"} ${messageClass}`;

        toast.innerHTML = `
            <span class="material-symbols-outlined"> ${iconClass} </span>
            <span class="toast-message"></span>
        `;
        container.appendChild(toast);
    }

    toast.querySelector(".toast-message").textContent = message;

    clearTimeout(toastTimer);
    toast.classList.add("show");
    toastTimer = setTimeout(() => {toast.classList.remove("show");}, 1000);

    // console.log("called toast");
}

function toggleSection(id, h){
    const el = document.getElementById(id)
    const category = h.closest(".char-category")

    el.classList.toggle("hidden")
    category.classList.toggle("collapsed")

    h.scrollIntoView()
}
