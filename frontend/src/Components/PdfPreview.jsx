import React, { useState, useEffect } from "react";
import { Typography, Grid } from "@mui/material";
import { useLanguage } from "../contexts/LanguageContext"; // Adjust the import path
import { ABOUT_US_TEXT, TEXT } from "../utilities/constants"; // Adjust the import path
import { Worker, Viewer, SpecialZoomLevel } from "@react-pdf-viewer/core";
import { searchPlugin } from "@react-pdf-viewer/search";
import "@react-pdf-viewer/core/lib/styles/index.css"; // Add core styles
import "@react-pdf-viewer/search/lib/styles/index.css"; // Add search styles
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js'; // Import the worker

function PdfPreview({ uploadedFile, highlightedText }) {
    const { language } = useLanguage();

    // Create a searchPlugin instance for highlighting text
    const searchPluginInstance = searchPlugin({
        keyword: highlightedText ? highlightedText.split(" ") : [], // Split the highlighted text into words for searching
    });

    const [documentLoad, setDocumentLoad] = useState(false);

    const handleDocumentLoad = () => {
        setDocumentLoad(true);
    };

    useEffect(() => {
        if (documentLoad && highlightedText !== "") {
            console.log(`Highlighted Text: ${highlightedText}`);
        }
    }, [documentLoad, highlightedText]);

    return (
        <Grid item>
            <Typography variant="h6" color={ABOUT_US_TEXT} sx={{ fontWeight: "bold" }}>
                {TEXT[language].FILE_PREVIEW}
            </Typography>
            <Typography sx={{ marginBottom: 2 }} variant="subtitle1" color={ABOUT_US_TEXT}>
                {uploadedFile.name}
            </Typography>
            <div style={{ border: "1px solid #ccc", borderRadius: "4px", height: "520px", overflow: "auto" }}>
                <Worker workerUrl={workerUrl}>
                    <Viewer
                        fileUrl={URL.createObjectURL(uploadedFile)}
                        defaultScale={SpecialZoomLevel.PageFit}
                        plugins={[searchPluginInstance]} // Pass the searchPlugin instance
                        onDocumentLoad={handleDocumentLoad}
                    />
                </Worker>
            </div>
        </Grid>
    );
}

export default PdfPreview;
