// src/data/testLinks.js
export const testLinks = [
    { title: 'Document 1', url: 'https://example.com/doc1.pdf' },
    { title: 'Document 2', url: 'https://example.com/doc2.pdf' },
    // Add more links up to 100 for testing
  ];
  
  for (let i = 3; i <= 100; i++) {
    testLinks.push({
      title: `Document ${i}`,
      url: `https://example.com/doc${i}.pdf`,
    });
  }
  