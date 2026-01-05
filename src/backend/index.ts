import express from 'express';
import cors from 'cors';
import calculationsRouter from './routes/calculations.js';
import processesRouter from './routes/processes.js';
import cdiRouter from './routes/cdi.js';


const app = express();
// Permite CORS para qualquer origem (ou especifique o domínio do frontend se quiser restringir)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/calculate', calculationsRouter);
app.use('/calculations', calculationsRouter);
app.use('/processes', processesRouter);
app.use('/cdi', cdiRouter);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
