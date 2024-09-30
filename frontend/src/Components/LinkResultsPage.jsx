// src/Components/LinkResultsPage.js
import React, { useState } from 'react';
import { Pagination, Grid, Link, Typography } from '@mui/material';

function LinkResultsPage({ links }) {
  const [currentPage, setCurrentPage] = useState(1);
  const linksPerPage = 10;

  // Calculate the indexes of the first and last links on the current page
  const indexOfLastLink = currentPage * linksPerPage;
  const indexOfFirstLink = indexOfLastLink - linksPerPage;
  const currentLinks = links.slice(indexOfFirstLink, indexOfLastLink);

  const handleChange = (event, value) => {
    setCurrentPage(value);
  };

  return (
    <Grid container direction="column" spacing={2}>
      {currentLinks.map((link, index) => (
        <Grid item key={index}>
          <Link href={link.url} target="_blank" rel="noopener">
            <Typography variant="body1">{link.title}</Typography>
          </Link>
        </Grid>
      ))}
      <Grid item>
        <Pagination
          count={Math.ceil(links.length / linksPerPage)}
          page={currentPage}
          onChange={handleChange}
          color="primary"
          showFirstButton
          showLastButton
        />
      </Grid>
    </Grid>
  );
}

export default LinkResultsPage;
