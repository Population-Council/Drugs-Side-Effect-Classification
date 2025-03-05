// src/components/LeftNav.js
import React from "react";
import { Grid, Box } from "@mui/material";
import closeIcon from "../Assets/close.svg"; // Assuming close.svg is an image
import arrowRightIcon from "../Assets/arrow_right.svg"; // Assuming arrow_right.svg is an image
import PdfPreview from "./PdfPreview"; // Import the PdfPreview component
import InfoSections from "./InfoSections"; // Import the InfoSections component
import Avatar from "./Avatar"; // Import the Avatar component
import VideoPreview from "./VideoPreview"; // Import the VideoPreview component
import AgentSelector from "./AgentSelector"; // Import the AgentSelector component
import { ALLOW_AVATAR_BOT, ALLOW_PDF_PREVIEW, ALLOW_VIDEO_PREVIEW } from "../utilities/constants";

function LeftNav({ showLeftNav = true, setLeftNav, uploadedFile, fileType }) {
  return (
    <>
      <Grid className="appHeight100">
        <Grid container direction="column" justifyContent="flex-start" alignItems="stretch" padding={4} spacing={2}>
          {showLeftNav ? (
            <>
              <Grid item container direction="row" justifyContent="space-between" alignItems="center" sx={{ marginBottom: "1rem" }}>
                {/* Close button on the left */}
                <Grid item>
                  <img
                    src={closeIcon}
                    alt="Close Panel"
                    onClick={() => setLeftNav(false)}
                    style={{ cursor: "pointer" }}
                  />
                </Grid>
                
                {/* Search and New Chat buttons on the right */}
                <Grid item container direction="row" justifyContent="flex-end" spacing={2} xs={6}>
                  {/* New Chat button */}
                  <Grid item>
                    <Box
                      component="div"
                      sx={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "30px",
                        height: "30px",
                      }}
                      title="Add new chat"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 5V19M5 12H19" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Box>
                  </Grid>
                  
                  {/* Search button */}
                  <Grid item>
                    <Box
                      component="div"
                      sx={{
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: "30px",
                        height: "30px",
                      }}
                      title="Search chat history"
                    >
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M21 21L15 15M17 10C17 13.866 13.866 17 10 17C6.13401 17 3 13.866 3 10C3 6.13401 6.13401 3 10 3C13.866 3 17 6.13401 17 10Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </Box>
                  </Grid>
                </Grid>
              </Grid>
              {uploadedFile && fileType === "application/pdf" && ALLOW_PDF_PREVIEW ? (
                <PdfPreview uploadedFile={uploadedFile} highlightedText="fair use"/>
              ) : uploadedFile && fileType === "video/mp4" && ALLOW_VIDEO_PREVIEW ? (
                <VideoPreview uploadedFile={uploadedFile} startTime={0} />
              ) : (
                <>
                  {/* Add AgentSelector component here */}
                  <AgentSelector />
                  
                  {ALLOW_AVATAR_BOT ? (
                    <Avatar /> // Show the Avatar component if ALLOW_AVATAR_BOT is true
                  ) : (
                    <InfoSections /> // Otherwise, show the InfoSections component
                  )}
                </>
              )}
            </>
          ) : (
            <>
              <Grid item container direction="column" justifyContent="flex-start" alignItems="flex-end">
                <img
                  src={arrowRightIcon}
                  alt="Open Panel"
                  onClick={() => setLeftNav(true)}
                />
              </Grid>
            </>
          )}
        </Grid>
      </Grid>
    </>
  );
}

export default LeftNav;
