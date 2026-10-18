
const viewport = document.getElementById("modelViewport");
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
        alert(
            "Picture-in-Picture is not supported in this browser."
        );
        return;
    }
    if (window.documentPictureInPicture.window) {
        window.documentPictureInPicture.window.focus();
        return;
    }

    let pipWindow;

    try {
        pipWindow =
            await window.documentPictureInPicture.requestWindow({
                width: 480,
                height: 560,
            });

        const doc = pipWindow.document;

        doc.title = "Model Viewer";

        const stylesheet = doc.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = new URL("../styles/pipViewer.css", import.meta.url).href;
        doc.head.appendChild(stylesheet);
        
        window.modelViewerPiPBridge.moveTo(doc.body);

        bridge.moveTo(doc.body);

        const observer = new ResizeObserver(() => {
            bridge.resize();
        });
        observer.observe(doc.body);

        pipWindow.addEventListener("pagehide", () => {
            observer.disconnect();
            bridge.restore();
        }, { once: true });

    } catch (error) {
        console.error("[PiP] Failed to open viewer:", error);

        if (pipWindow && !pipWindow.closed) {
            try {
                bridge.restore();
            } catch (e) {
                console.error(
                    "[PiP] Failed to restore viewer:", e
                );
            }
        }

        alert("Unable to open the floating viewer :(");
    }
}
