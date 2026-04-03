import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'evalx-api' });
});

app.listen(PORT, () => {
  console.log(`[API] EvalX API Gateway listening on port ${PORT}`);
});
