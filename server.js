const { server } = require('./home-page/server.js');

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`POS backend listening on http://localhost:${PORT}`);
});

module.exports = server;
