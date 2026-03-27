const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '50mb' }));

const MONGO_URI = "mongodb+srv://manassuthar62:Man%407073@cluster0.gbinpqa.mongodb.net/?appName=Cluster0";
mongoose.connect(MONGO_URI).then(() => console.log('✅ Database Connected'));

// --- SCHEMAS ---
const StudentSchema = new mongoose.Schema({
    studentName: String, fatherName: String, motherName: String, dob: String, category: String,
    mobile: String, altMobile: String, janAadhar: String, ssoId: String, password: String,
    rollNumber: String, percentage: String, passingYear: String, school: String, course: String,
    familyIncome: String, uploadDate: String, enteredBy: String,
    marksheet10th: String, incomeProof: String,
    
    // Status Flow: Pending -> Assigned -> Completed / Rejected
    status: { type: String, default: 'Pending' },
    adminRemark: { type: String, default: '' },
    assignedTo: { type: String, default: '' } // Kis Filler ko mila hai
});
const Student = mongoose.model('Student', StudentSchema);

const EmployeeSchema = new mongoose.Schema({
    name: String, username: String, password: String,
    role: { type: String, default: 'field' } // 'field' (Data Entry) or 'filler' (Form Filler)
});
const Employee = mongoose.model('Employee', EmployeeSchema);

function normalizeValue(value = '') {
    return String(value).trim().replace(/\s+/g, ' ').toLowerCase();
}

async function findDuplicateStudent({ studentName, fatherName }, excludeId = null) {
    const candidates = await Student.find(excludeId ? { _id: { $ne: excludeId } } : {}).select('studentName fatherName ssoId enteredBy');
    return candidates.find((student) =>
        normalizeValue(student.studentName) === normalizeValue(studentName) &&
        normalizeValue(student.fatherName) === normalizeValue(fatherName)
    );
}

// --- ROUTES ---

// 1. Unified Login (Role Batayega)
app.post('/api/employee-login', async (req, res) => {
    const user = await Employee.findOne(req.body);
    if (user) res.json({ success: true, name: user.name, username: user.username, role: user.role }); // Role bhej rahe hain
    else res.status(401).json({ error: "Fail" });
});

// 2. Manage Employees
app.post('/api/add-employee', async (req, res) => { await new Employee(req.body).save(); res.json({ msg: "Saved" }); });
app.get('/api/employees', async (req, res) => { res.json(await Employee.find()); });
app.delete('/api/employees/:id', async (req, res) => { await Employee.findByIdAndDelete(req.params.id); res.json({ msg: "Deleted" }); });

// 3. Student Operations
app.get('/api/check-student-duplicate', async (req, res) => {
    try {
        const { studentName = '', fatherName = '', excludeId = '' } = req.query;
        if (!studentName.trim() || !fatherName.trim()) {
            return res.json({ exists: false });
        }

        const duplicate = await findDuplicateStudent({ studentName, fatherName }, excludeId || null);
        if (!duplicate) return res.json({ exists: false });

        res.json({
            exists: true,
            duplicate: {
                id: duplicate._id,
                studentName: duplicate.studentName,
                fatherName: duplicate.fatherName,
                ssoId: duplicate.ssoId,
                enteredBy: duplicate.enteredBy
            }
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/add-student', async (req, res) => {
    try {
        const duplicate = await findDuplicateStudent(req.body);
        if (duplicate) {
            return res.status(409).json({
                error: 'Duplicate student record already exists.',
                duplicate: {
                    studentName: duplicate.studentName,
                    fatherName: duplicate.fatherName,
                    ssoId: duplicate.ssoId,
                    enteredBy: duplicate.enteredBy
                }
            });
        }
        await new Student(req.body).save();
        res.status(201).json({ message: 'Saved' });
    } 
    catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/edit-student/:id', async (req, res) => {
    try {
        const duplicate = await findDuplicateStudent(req.body, req.params.id);
        if (duplicate) {
            return res.status(409).json({
                error: 'Duplicate student record already exists.',
                duplicate: {
                    studentName: duplicate.studentName,
                    fatherName: duplicate.fatherName,
                    ssoId: duplicate.ssoId,
                    enteredBy: duplicate.enteredBy
                }
            });
        }
        await Student.findByIdAndUpdate(req.params.id, { ...req.body, status: 'Pending', assignedTo: '' }); // Re-submit par assignment hata do
        res.json({ message: 'Updated' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});
app.get('/api/students', async (req, res) => { res.json(await Student.find()); });
app.get('/api/my-students/:empName', async (req, res) => { res.json(await Student.find({ enteredBy: req.params.empName })); });
app.delete('/api/students/:id', async (req, res) => { await Student.findByIdAndDelete(req.params.id); res.json({ msg: "Deleted" }); });

// 4. ADMIN & FILLER ACTIONS
app.put('/api/assign-task/:id', async (req, res) => {
    // Admin assigns task
    await Student.findByIdAndUpdate(req.params.id, { 
        status: 'Assigned', 
        assignedTo: req.body.assignedTo 
    });
    res.json({ msg: "Assigned" });
});

app.put('/api/update-status/:id', async (req, res) => {
    // Filler completes/rejects task
    await Student.findByIdAndUpdate(req.params.id, { 
        status: req.body.status, 
        adminRemark: req.body.remark 
    });
    res.json({ msg: "Status Updated" });
});

// Get tasks for specific Filler
app.get('/api/filler-tasks/:username', async (req, res) => {
    const requestedUser = req.params.username;
    const employee = await Employee.findOne({
        $or: [
            { username: requestedUser },
            { name: requestedUser }
        ]
    }).select('username');

    const lookupValues = employee?.username && employee.username !== requestedUser
        ? [requestedUser, employee.username]
        : [requestedUser];

    const tasks = await Student.find({ assignedTo: { $in: lookupValues } });
    res.json(tasks);
});

// Update Password
app.put('/api/update-employee-pass/:id', async (req, res) => {
    await Employee.findByIdAndUpdate(req.params.id, { password: req.body.password });
    res.json({ message: "Password Updated" });
});

app.listen(5000, () => console.log('🚀 Server Started'));
