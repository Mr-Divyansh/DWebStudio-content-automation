import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { ImportService } from '../../services/importService.js';
import { InstagramZipExtractor } from '../../importers/instagram/instagramZipExtractor.js';

export const importRouter = Router();

// Setup multer storage in data/instagram/export
const uploadDir = InstagramZipExtractor.getExportFolder();
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const safeName = `${Date.now()}_${file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB limit
});

importRouter.get('/', async (_req, res) => {
  try {
    const imports = await ImportService.getAllImports();
    res.json(imports);
  } catch (err: any) {
    console.error('Error fetching imports:', err);
    res.status(500).json({ error: err?.message || 'Failed to fetch imports' });
  }
});

// Check status of local export folder
importRouter.get('/instagram/check-folder', (_req, res) => {
  try {
    const folder = InstagramZipExtractor.getExportFolder();
    const files = fs.existsSync(folder) ? fs.readdirSync(folder) : [];
    const zipFiles = files.filter((f) => f.toLowerCase().endsWith('.zip'));
    res.json({
      folderPath: folder,
      zipFiles,
      hasZip: zipFiles.length > 0,
    });
  } catch (err: any) {
    res.status(500).json({ error: err?.message || 'Failed to check export folder' });
  }
});

// Import Instagram (either uploaded ZIP or triggers scan of data/instagram/export/)
importRouter.post('/instagram', upload.single('zipFile') as any, async (req: any, res: any) => {
  try {
    const filePath = req.file?.path;
    const result = await ImportService.importInstagramZip(filePath);
    res.json({
      success: true,
      message: 'Instagram import completed successfully',
      data: result,
    });
  } catch (err: any) {
    console.error('Instagram import error:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Instagram import failed',
    });
  }
});

// Import WhatsApp (supports JSON body { chatText, title } or file upload)
importRouter.post('/whatsapp', upload.single('chatFile') as any, async (req: any, res: any) => {
  try {
    let chatText = req.body.chatText;
    let title = req.body.title || 'WhatsApp Chat';

    if (req.file) {
      chatText = fs.readFileSync(req.file.path, 'utf8');
      title = req.file.originalname;
    }

    if (!chatText || !chatText.trim()) {
      return res.status(400).json({ error: 'WhatsApp chat text or file is required.' });
    }

    const result = await ImportService.importWhatsApp(chatText, title);
    res.json({
      success: true,
      message: 'WhatsApp conversation imported and analyzed',
      data: result,
    });
  } catch (err: any) {
    console.error('WhatsApp import error:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'WhatsApp import failed',
    });
  }
});

// Import Call Transcript (supports JSON body { transcript, title, callNotes, durationMinutes } or file)
importRouter.post('/calls', upload.single('transcriptFile') as any, async (req: any, res: any) => {
  try {
    let transcript = req.body.transcript;
    let title = req.body.title || 'Discovery Call';
    const callNotes = req.body.callNotes;
    const durationMinutes = req.body.durationMinutes ? parseInt(req.body.durationMinutes, 10) : undefined;

    if (req.file) {
      transcript = fs.readFileSync(req.file.path, 'utf8');
      title = req.file.originalname;
    }

    if (!transcript || !transcript.trim()) {
      return res.status(400).json({ error: 'Call transcript text or file is required.' });
    }

    const result = await ImportService.importCall(transcript, {
      title,
      callNotes,
      durationMinutes,
    });

    res.json({
      success: true,
      message: 'Call transcript imported and analyzed',
      data: result,
    });
  } catch (err: any) {
    console.error('Call import error:', err);
    res.status(500).json({
      success: false,
      error: err?.message || 'Call import failed',
    });
  }
});
