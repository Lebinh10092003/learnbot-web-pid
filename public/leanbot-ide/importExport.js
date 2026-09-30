export class importExport{

    static async importFileFromLocalDrive(filesFromDrop = null) {
        try {
            const fileInput = document.createElement("input");
            fileInput.type = "file";
            fileInput.accept = ".ino,.bduino";
            fileInput.multiple = true;
            fileInput.style.display = "none";

            document.body.appendChild(fileInput);

            const importFiles = new Promise((resolve) => {
                fileInput.addEventListener("change", (e) => {
                    resolve(Array.from(e.target.files || []));
                    document.body.removeChild(fileInput);// remove after use
                }, { once: true });
            });

            if (filesFromDrop && filesFromDrop.length) { // drop files present

                const accepted = filterAcceptedSketchFiles(filesFromDrop);

                if (!accepted.length) return [];

                // forward dropped files into input
                const dt = new DataTransfer();

                for (const f of accepted) {
                    dt.items.add(f);
                }

                fileInput.files = dt.files;

            // trigger change without opening picker
            fileInput.dispatchEvent(new Event("change"));

            }
            else {
                // open picker
                fileInput.value = "";
                fileInput.click();
            }

            const files = await importFiles;

            // const acceptedFiles = filterAcceptedSketchFiles(files);

            // if (!acceptedFiles.length) return [];

            const filesObject = [];

            for (const f of files) {
                const text = await f.text();
                const item = { fileName: f.name, text: text };
                filesObject.push(item);
            }

            return filesObject;

        }
        catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // alert("[IMPORT] Error: " + msg);
        }
    }
    
    // Function to download data to a file
    // ref: https://stackoverflow.com/questions/11620698/how-to-trigger-a-file-download-when-clicking-an-html-button-or-javascript#:~:text=25%20Answers&text=You%20can%20trigger%20a%20download%20with%20the%20HTML5%20download%20attribute.&text=Where:,defaults%20to%20the%20file's%20name.
    static exportFileToLocalDrive(data, filename) {
        const file = new Blob([data], { type: "text/plain" });

        // if (window.navigator.msSaveOrOpenBlob) { // Legacy IE 10+
        //     window.navigator.msSaveOrOpenBlob(file, filename);
        //     return null;
        // }

        const a = document.createElement("a");
        const url = URL.createObjectURL(file);

        a.href = url;
        a.download = filename;

        document.body.appendChild(a);

        a.click();
        setTimeout(function() {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);  
        }, 0); 
    }
}

function isAcceptedSketchFile(file) {
  const name = file.name.toLowerCase();
  return name.endsWith(".ino") || name.endsWith(".bduino");
}

function filterAcceptedSketchFiles(files) {
    return Array.from(files).filter(isAcceptedSketchFile);
}