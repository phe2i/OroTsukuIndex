const pipButton = document.getElementById("modelViewerPiPButton");

if (pipButton) {
    pipButton.addEventListener("click", openPiP);
}

async function openPiP() {
    const bridge = window.modelViewerPiPBridge;

    if (!bridge) {
        console.error("[PiP] Viewer bridge is not ready :(");
        return;
    }

    if (!("documentPictureInPicture" in window)) {
        alert("Picture-in-Picture is not supported in this browser.");
        return;
    }

    if (window.documentPictureInPicture.window) {
        window.documentPictureInPicture.window.focus();
        return;
    }

    let pipWindow;

    try {
        pipWindow = await window.documentPictureInPicture.requestWindow({
            width: 480,
            height: 600,
        });

        const doc = pipWindow.document;
        doc.title = "Model Viewer";

        const stylesheets = [
            "../styles/global.css",
            "../styles/modelViewer.css",
            "../styles/pipViewer.css"
        ];

        stylesheets.forEach(path => {
            const link = doc.createElement("link");
            link.rel = "stylesheet";
            link.href = new URL(path, import.meta.url).href;
            doc.head.appendChild(link);
        });
        
        window.modelViewerPiPBridge.moveTo(doc.body);

        bridge.moveTo(doc.body);
        bridge.mountPinnedBar(doc.body);

        const observer = new ResizeObserver(() => bridge.resize());
        observer.observe(doc.body);

        pipWindow.addEventListener("pagehide", () => {
            observer.disconnect();
            bridge.unmountPinnedBar();
            bridge.restore();
        }, { once: true });

    } catch (error) {
        console.error("[PiP] Failed to open viewer:", error);

        if (pipWindow && !pipWindow.closed) {
            try {
                bridge.unmountPinnedBar();
                bridge.restore();
            } catch (restoreError) {
                console.error("[PiP] Failed to restore viewer:", restoreError);
            }
        }

        alert("Unable to open the floating viewer :(");
    }
}
