const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const PORT = process.env.PORT || 3000;

// Security & Lightweight Middlewares
app.use(helmet({
    contentSecurityPolicy: false // Disabled for CDN compatibility
}));
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Ensure upload and data directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DATA_FILE = path.join(__dirname, 'projects.json');

if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// In-Memory Database + File Persistence for low RAM overhead
let projects = [];

function loadProjects() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const data = fs.readFileSync(DATA_FILE, 'utf-8');
            projects = JSON.parse(data);
        } catch (e) {
            projects = [];
        }
    } else {
        // Initial Seed Projects
        projects = [
            {
                id: "proj_demo_1",
                title: "لعبة المغامرة الفضائية",
                description: "مشروع سكراتش رائع يتحكم بطائرة فضائية تتفادى النيازك وتجمع النجوم.",
                author: "أحمد المبرمج",
                tags: ["العاب", "فضائيات", "حركة"],
                filename: "demo_space.sb3",
                originalName: "space_adventure.sb3",
                likes: 42,
                downloads: 128,
                createdAt: new Date().toISOString()
            },
            {
                id: "proj_demo_2",
                title: "محاكي الفيزياء البسيط",
                description: "مشروع يستعرض قوانين الجاذبية والارتداد في بيئة سكراتش سهلة الفهم.",
                author: "سارة محبة العلوم",
                tags: ["فيزياء", "تعليمي", "محاكاة"],
                filename: "demo_physics.sb3",
                originalName: "physics_sim.sb3",
                likes: 89,
                downloads: 310,
                createdAt: new Date().toISOString()
            }
        ];
        saveProjects();
    }
}

function saveProjects() {
    fs.writeFileSync(DATA_FILE, JSON.stringify(projects, null, 2));
}

loadProjects();

// File Storage Setup with Multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOADS_DIR);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        const ext = path.extname(file.originalname).toLowerCase() || '.sb3';
        cb(null, `scratch-${uniqueSuffix}${ext}`);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 15 * 1024 * 1024 }, // 15MB file size limit for low memory safety
    fileFilter: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        if (ext === '.sb3' || ext === '.json') {
            cb(null, true);
        } else {
            cb(new Error('يُسمح فقط برفع ملفات سكراتش (.sb3 أو .json)'));
        }
    }
});

// Serve Static Files
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOADS_DIR));

// API Routes

// 1. Get All Projects (with search & filter)
app.get('/api/projects', (req, res) => {
    let result = [...projects];
    const { query, tag } = req.query;

    if (query) {
        const q = query.toLowerCase();
        result = result.filter(p => p.title.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.author.toLowerCase().includes(q));
    }

    if (tag) {
        result = result.filter(p => p.tags && p.tags.includes(tag));
    }

    // Sort by latest
    result.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json({ success: true, count: result.length, projects: result });
});

// 2. Upload Project File
app.post('/api/projects/upload', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'الرجاء اختيار ملف سكراتش متوافق (.sb3 أو .json)' });
        }

        const { title, description, author, tags } = req.body;
        
        if (!title || !author) {
            return res.status(400).json({ success: false, message: 'عنوان المشروع واسم الناشر مطلوبان' });
        }

        const parsedTags = tags ? tags.split(',').map(t => t.trim()).filter(Boolean) : ['عام'];

        const newProject = {
            id: 'proj_' + Date.now(),
            title: title.trim(),
            description: (description || '').trim(),
            author: author.trim(),
            tags: parsedTags,
            filename: req.file.filename,
            originalName: req.file.originalname,
            likes: 0,
            downloads: 0,
            createdAt: new Date().toISOString()
        };

        projects.unshift(newProject);
        saveProjects();

        res.status(201).json({ success: true, message: 'تم نشر المشروع بنجاح!', project: newProject });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message || 'حدث خطأ أثناء رفع الملف' });
    }
});

// 3. Download Project
app.get('/api/projects/download/:id', (req, res) => {
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
        return res.status(404).send('المشروع غير موجود');
    }

    const filePath = path.join(UPLOADS_DIR, project.filename);
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('الملف غير متوفر على الخادم');
    }

    project.downloads += 1;
    saveProjects();

    res.download(filePath, project.originalName);
});

// 4. Like / Star Project
app.post('/api/projects/like/:id', (req, res) => {
    const project = projects.find(p => p.id === req.params.id);
    if (!project) {
        return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }

    project.likes += 1;
    saveProjects();

    res.json({ success: true, likes: project.likes });
});

// Fallback Route
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global Error Handler for Uploads
app.use((err, req, res, next) => {
    if (err instanceof multer.MulterError) {
        return res.status(400).json({ success: false, message: `خطأ في الرفع: ${err.message}` });
    } else if (err) {
        return res.status(400).json({ success: false, message: err.message });
    }
    next();
});

// Start Lightweight Server
app.listen(PORT, () => {
    console.log(`🚀 Scratch Hub running smoothly on http://localhost:${PORT} [RAM Usage Optimized]`);
});
