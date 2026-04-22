const express = require('express');
const router = express.Router();

const Services = require('./Services');
const { User, Tasks, Project } = require('./domain');
const appServices = new Services();


// User Routes
router.post('/api/users', (req, res) => {
    const { username, email, passwordHash, experienceYears } = req.body;
    let errors = [];

    if (!username || username.length < 5 || username.length > 30) errors.push("Username must be 5-30 characters.");
    if (!email || !email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) errors.push("Invalid email format.");
    if (!passwordHash || passwordHash.length < 8) errors.push("Password must be at least 8 characters.");
    if (experienceYears === undefined || experienceYears === null || parseInt(experienceYears) < 0) errors.push("Experience must be a valid number.");

    if (errors.length > 0) {
        return res.status(400).json({ error: errors.join(" | ") });
    }

    if (appServices.getUserByEmail(email)) {
        return res.status(409).json({ error: "A user with this email already exists." });
    }

    const newUser = new User(username, email, passwordHash, parseInt(experienceYears));
    appServices.addUser(newUser);
    
    res.status(201).json({ message: "User successfully initialized.", data: newUser });
});

router.post('/api/login', (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return res.status(400).json({ error: "Email and password are required." });
    }

    const user = appServices.getUserByEmail(email);
    
    if (!user) {
        return res.status(404).json({ error: "User not found." });
    }

    if (user.passwordHash !== password) {
        return res.status(401).json({ error: "Invalid password." });
    }

    const safeUser = { id: user.id, username: user.username, email: user.email };
    
    res.status(200).json({ message: "Authentication successful.", data: safeUser });
});

router.get('/api/users', (req, res) => {
    const users = appServices.getAllUsers();
    res.status(200).json({ data: users });
});

router.get('/api/users/:email', (req, res) => {
    const email = req.params.email;
    const user = appServices.getUserByEmail(email);

    if (!user) {
        return res.status(404).json({ error: "System Error: User not found." });
    }
    res.status(200).json({ data: user });
});

router.put('/api/users/:email', (req, res) => {
    const email = req.params.email;
    const updatedData = req.body; 
    const updatedUser = appServices.updateUser(email, updatedData);
    
    if (!updatedUser) {
        return res.status(404).json({ error: "System Error: User not found." });
    }
    res.status(200).json({ message: "User parameters updated.", data: updatedUser });
});

router.delete('/api/users/:email', (req, res) => {
    const email = req.params.email;
    const deletedUser = appServices.deleteUser(email);
    
    if (!deletedUser) {
        return res.status(404).json({ error: "System Error: User not found." });
    }
    res.status(200).json({ message: `User [${email}] completely erased.` });
});


// Tasks Routes
// Create a Task
router.post('/api/tasks', (req, res) => {
    const { projectId, title, description, creatorEmail, status, completed, tags, start, end, predicted } = req.body;
    let errors = [];

    // SERVER-SIDE VALIDATION
    if (!title || title.length < 5 || title.length > 30) errors.push("Task title must be between 5 and 30 characters.");
    if (!description || description.length < 10 || description.length > 500) errors.push("Description must be between 10 and 500 characters.");
    if (!tags || !Array.isArray(tags) || tags.length === 0) errors.push("At least one tag is required.");
    
    // Task-specific constraints
    if (!projectId || isNaN(parseInt(projectId))) errors.push("A valid Project ID is required.");
    if (!end || isNaN(new Date(end).getTime())) errors.push("A valid deadline date is required.");

    if (errors.length > 0) return res.status(400).json({ error: errors.join(" | ") });

    // Assuming you have a Task model and appServices logic
    const newTask = { id: Date.now(), projectId: parseInt(projectId), title, description, creatorEmail, status, completed, tags, start, end, predicted };
    appServices.addTask(newTask); 
    
    res.status(201).json({ message: "Task created successfully.", data: newTask });
});

// Update a Task
router.put('/api/tasks/:id', (req, res) => {
    const { projectId, title, description, status, completed, tags, start, end, predicted } = req.body;
    let errors = [];

    // SERVER-SIDE VALIDATION
    if (!title || title.length < 5 || title.length > 30) errors.push("Task title must be between 5 and 30 characters.");
    if (!description || description.length < 10 || description.length > 500) errors.push("Description must be between 10 and 500 characters.");
    if (!tags || !Array.isArray(tags) || tags.length === 0) errors.push("At least one tag is required.");
    
    // Task-specific constraints
    if (!projectId || isNaN(parseInt(projectId))) errors.push("A valid Project ID is required.");
    if (!end || isNaN(new Date(end).getTime())) errors.push("A valid deadline date is required.");

    if (errors.length > 0) return res.status(400).json({ error: errors.join(" | ") });

    // Assuming you have an update function
    const updatedTask = appServices.updateTask(parseInt(req.params.id), req.body);
    if (!updatedTask) return res.status(404).json({ error: "Task not found." });

    res.status(200).json({ message: "Task updated successfully.", data: updatedTask });
});

router.get('/api/tasks', (req, res) => {
    const tasks = appServices.getAllTasks();
    res.status(200).json({ data: tasks });
});

router.get('/api/tasks/:email', (req, res) => {
    const email = req.params.email;
    const tasks = appServices.getTasksByUserEmail(email);

    if (!tasks.length) {
        return res.status(404).json({ error: "System Error: Tasks not found." });
    }
    res.status(200).json({ data: tasks });
});

router.delete('/api/tasks/:id', (req, res) => {
    const id = req.params.id;
    const deletedTask = appServices.deleteTask(parseInt(id));

    if (!deletedTask) {
        return res.status(404).json({ error: "System Error: Task not found." });
    }
    res.status(200).json({ message: `Task [${id}] completely erased.` });
});


// Project Routes
// Create a Project
router.post('/api/projects', (req, res) => {
    const { title, description, creatorEmail, tags, associatedFiles, associatedEmails } = req.body;
    let errors = [];

    // SERVER-SIDE VALIDATION
    if (!title || title.length < 5 || title.length > 30) errors.push("Project title must be between 5 and 30 characters.");
    if (!description || description.length < 10 || description.length > 500) errors.push("Description must be between 10 and 500 characters.");
    if (!tags || !Array.isArray(tags) || tags.length === 0) errors.push("At least one tag is required.");

    if (errors.length > 0) return res.status(400).json({ error: errors.join(" | ") });

    // Assuming you have a Project model and appServices logic
    const newProject = { id: Date.now(), title, description, creatorEmail, tags, associatedFiles, associatedEmails };
    appServices.addProject(newProject); // Replace with your actual DB saving function
    
    res.status(201).json({ message: "Project created successfully.", data: newProject });
});

// Update a Project
router.put('/api/projects/:id', (req, res) => {
    const { title, description, tags, associatedFiles, associatedEmails } = req.body;
    let errors = [];

    // SERVER-SIDE VALIDATION
    if (!title || title.length < 5 || title.length > 30) errors.push("Project title must be between 5 and 30 characters.");
    if (!description || description.length < 10 || description.length > 500) errors.push("Description must be between 10 and 500 characters.");
    if (!tags || !Array.isArray(tags) || tags.length === 0) errors.push("At least one tag is required.");

    if (errors.length > 0) return res.status(400).json({ error: errors.join(" | ") });

    // Assuming you have an update function
    const updatedProject = appServices.updateProject(parseInt(req.params.id), req.body);
    if (!updatedProject) return res.status(404).json({ error: "Project not found." });

    res.status(200).json({ message: "Project updated successfully.", data: updatedProject });
});

router.get('/api/projects', (req, res) => {
    const projects = appServices.getAllProjects();
    res.status(200).json({ data: projects });
});

router.get('/api/projects/:email', (req, res) => {
    const email = req.params.email;
    const projects = appServices.getProjectsByUserEmail(email);

    if (!projects.length) {
        return res.status(404).json({ error: "System Error: Projects not found." });
    }
    res.status(200).json({ data: projects });
});

router.delete('/api/projects/:id', (req, res) => {
    const id = req.params.id;
    const deletedProject = appServices.deleteProject(parseInt(id));

    if (!deletedProject) {
        return res.status(404).json({ error: "System Error: Project not found." });
    }
    res.status(200).json({ message: `Project [${id}] completely erased.` });
});

// ==========================================
// BACKGROUND FAKER GENERATOR & WEBSOCKETS
// ==========================================
const { faker } = require('@faker-js/faker');
let generatorInterval = null;

// Start the Generator
router.post('/api/generate/start', (req, res) => {
    if (generatorInterval) {
        return res.status(400).json({ error: "Generator is already running." });
    }

    console.log("> BACKGROUND GENERATOR: STARTED");

    // Start the asynchronous loop (Runs every 4 seconds to give you time to read)
    generatorInterval = setInterval(() => {
        const newProjects = [];
        const newTasks = [];

        // 1. GENERATE A PROJECT
        const fakeProject = {
            title: faker.company.name() + " Init",
            description: faker.company.catchPhrase(),
            creatorEmail: "ai-generator@system.com",
            tags: [faker.commerce.department(), "auto-generated"], // Required by your validation
            associatedFiles: [`${faker.system.commonFileName()}`],
            associatedEmails: [faker.internet.email()]
        };
        
        // Add it to the DB (appServices automatically assigns it an ID!)
        appServices.addProject(fakeProject); 
        newProjects.push(fakeProject);

        // 2. GENERATE TASKS LINKED TO THAT PROJECT
        const taskCount = Math.floor(Math.random() * 3) + 1; // 1 to 3 tasks
        for (let i = 0; i < taskCount; i++) {
            const fakeTask = {
                projectId: fakeProject.id, // Dynamically linked!
                title: faker.hacker.verb() + " " + faker.hacker.noun(), 
                description: faker.lorem.sentence(),
                creatorEmail: "ai-generator@system.com",
                status: faker.helpers.arrayElement(['pending', 'completed']),
                completed: false,
                tags: [faker.hacker.noun(), "auto-generated"],
                start: new Date().toISOString().split('T')[0],
                end: faker.date.soon({ days: 10 }).toISOString().split('T')[0],
                predicted: faker.number.int({ min: 1, max: 20 })
            };

            if (fakeTask.status === 'completed') fakeTask.completed = true;

            appServices.addTask(fakeTask); 
            newTasks.push(fakeTask);
        }

        console.log(`> GENERATED 1 PROJECT & ${taskCount} TASKS. BROADCASTING...`);

        // 3. BROADCAST BOTH ARRAYS
        req.app.locals.broadcast({ 
            type: 'NEW_BATCH', 
            projects: newProjects,
            tasks: newTasks 
        });

    }, 4000); 

    res.status(200).json({ message: "Generator sequence started." });
});

// Stop the Generator
router.post('/api/generate/stop', (req, res) => {
    if (generatorInterval) {
        clearInterval(generatorInterval);
        generatorInterval = null;
        console.log("> BACKGROUND GENERATOR: STOPPED");
    }
    res.status(200).json({ message: "Generator sequence stopped." });
});

module.exports = router;