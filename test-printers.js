console.log('--- Testing "pdf-to-printer" directly on Windows ---');

try {
    const { getPrinters } = require('pdf-to-printer');

    console.log('Calling getPrinters() from pdf-to-printer...');

    getPrinters()
      .then(printers => {
        console.log('\nSuccess! Found printers:');
        console.log(printers);
      })
      .catch(error => {
        console.error('\nTest Failed! Detailed Error:');
        // Log the full error object to get the stack trace
        console.error(error);
      });

} catch (e) {
    console.error('A critical error occurred while requiring the library:');
    console.error(e);
}
