import express from 'express';
import cors from 'cors';
import calculationsRouter from './routes/calculations.js';
import processesRouter from './routes/processes.js';
import cdiRouter from './routes/cdi.js';
import bcbRouter from './routes/bcb.js';
import settingsRouter from './routes/settings.js';
import com299Router from './routes/com299.js';


const app = express();
// Permite CORS para qualquer origem (ou especifique o domínio do frontend se quiser restringir)
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

app.use('/calculate', calculationsRouter);
app.use('/calculations', calculationsRouter);
app.use('/processes', processesRouter);
app.use('/cdi', cdiRouter);
app.use('/bcb', bcbRouter);
app.use('/settings', settingsRouter);
app.use('/com299', com299Router);

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
