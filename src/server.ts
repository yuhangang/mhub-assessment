import { createApp } from './app';

const port = Number(process.env.PORT || 3000);

createApp().listen(port, () => {
  console.log(`MHUB workflow engine listening on http://localhost:${port}`);
});

