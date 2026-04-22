const Services = require('./services');
const { User, Tasks, Project } = require('./domain');

describe('> Core Services Logic (100% Coverage Suite)', () => {
    let appServices;

    beforeEach(() => {
        appServices = new Services();
    });

    // 1. USER TESTS
    test('should add a user and get all users', () => {
        const newUser = new User("Trinity", "trinity@matrix.com", "pass1234", 5);
        appServices.addUser(newUser);
        const users = appServices.getAllUsers();
        expect(users.length).toBe(1);
        expect(users[0].username).toBe("Trinity");
    });

    test('should get a user by email', () => {
        appServices.addUser(new User("Neo", "neo@matrix.com", "pass1234", 2));
        const user = appServices.getUserByEmail("neo@matrix.com");
        expect(user).toBeDefined();
        expect(user.username).toBe("Neo");
    });

    test('should update an existing user', () => {
        appServices.addUser(new User("Neo", "neo@matrix.com", "pass1234", 2));
        const updatedUser = new User("Neo (The One)", "neo@matrix.com", "newpass123", 10);
        const result = appServices.updateUser("neo@matrix.com", updatedUser);
        expect(result).not.toBeNull();
        expect(result.username).toBe("Neo (The One)");
    });

    test('should return null when updating a non-existent user', () => {
        expect(appServices.updateUser("ghost@matrix.com", new User("Ghost", "ghost", "pass", 1))).toBeNull();
    });

    test('should delete an existing user', () => {
        appServices.addUser(new User("Dozer", "dozer@matrix.com", "pass1234", 5));
        const deleted = appServices.deleteUser("dozer@matrix.com");
        expect(deleted.username).toBe("Dozer");
        expect(appServices.getAllUsers().length).toBe(0);
    });

    test('should return null when deleting a non-existent user', () => {
        expect(appServices.deleteUser("ghost@matrix.com")).toBeNull();
    });

    // 2. TASK TESTS
    test('should add a task and auto-generate an ID', () => {
        const newTask = new Tasks(0, "Hack Mainframe", "Description here", "neo@matrix.com", 101, "pending", ["urgent"], "2026-03-25");
        appServices.addTask(newTask);
        const tasks = appServices.getAllTasks();
        expect(tasks.length).toBe(1);
        expect(tasks[0].id).toBeGreaterThan(0); 
    });

    test('should get task by ID', () => {
        const newTask = new Tasks(0, "Learn Kung Fu", "Description here", "neo", 1, "pending", ["training"], "date");
        appServices.addTask(newTask);
        const fetchedId = appServices.getAllTasks()[0].id;
        expect(appServices.getTaskById(fetchedId).title).toBe("Learn Kung Fu");
    });

    test('should get tasks by User Email and Project ID', () => {
        appServices.addTask(new Tasks(0, "Task 1", "Desc", "neo@matrix.com", 101, "pending", [], "date"));
        appServices.addTask(new Tasks(0, "Task 2", "Desc", "neo@matrix.com", 102, "pending", [], "date"));
        expect(appServices.getTasksByUserEmail("neo@matrix.com").length).toBe(2);
        expect(appServices.getTasksByProjectId(101).length).toBe(1);
    });

    test('should update a task', () => {
        appServices.addTask(new Tasks(0, "Old Task", "Desc", "neo", 1, "pending", [], "date"));
        const taskId = appServices.getAllTasks()[0].id;
        const updatedData = new Tasks(taskId, "New Task", "Desc", "neo", 1, "completed", [], "date");
        const result = appServices.updateTask(taskId, updatedData);
        expect(result.title).toBe("New Task");
        expect(result.status).toBe("completed");
    });

    test('should return null when updating non-existent task', () => {
        expect(appServices.updateTask(999, {})).toBeNull();
    });

    test('should delete a task', () => {
        appServices.addTask(new Tasks(0, "To Delete", "Desc", "neo", 1, "pending", [], "date"));
        const taskId = appServices.getAllTasks()[0].id;
        const deleted = appServices.deleteTask(taskId);
        expect(deleted.title).toBe("To Delete");
        expect(appServices.getAllTasks().length).toBe(0);
    });

    test('should return null when deleting non-existent task', () => {
        expect(appServices.deleteTask(999)).toBeNull();
    });

    // 3. PROJECT TESTS
    test('should add a project and auto-generate ID', () => {
        const newProj = new Project(0, "Zion Defense", "Desc", "neo@matrix.com", [], []);
        appServices.addProject(newProj);
        const projects = appServices.getAllProjects();
        expect(projects.length).toBe(1);
        expect(projects[0].id).toBeGreaterThan(0);
    });

    test('should get project by ID and Email', () => {
        appServices.addProject(new Project(0, "Zion Defense", "Desc", "neo@matrix.com", [], []));
        const projId = appServices.getAllProjects()[0].id;
        expect(appServices.getProjectById(projId).title).toBe("Zion Defense");
        expect(appServices.getProjectsByUserEmail("neo@matrix.com").length).toBe(1);
    });

    test('should update a project', () => {
        appServices.addProject(new Project(0, "Old Title", "Desc", "neo", [], []));
        const projId = appServices.getAllProjects()[0].id;
        const updatedData = new Project(projId, "New Title", "Desc", "neo", [], []);
        const result = appServices.updateProject(projId, updatedData);
        expect(result.title).toBe("New Title");
    });

    test('should return null when updating non-existent project', () => {
        expect(appServices.updateProject(999, {})).toBeNull();
    });

    test('should delete a project', () => {
        appServices.addProject(new Project(0, "To Delete", "Desc", "neo", [], []));
        const projId = appServices.getAllProjects()[0].id;
        const deleted = appServices.deleteProject(projId);
        expect(deleted.title).toBe("To Delete");
        expect(appServices.getAllProjects().length).toBe(0);
    });

    test('should return null when deleting non-existent project', () => {
        expect(appServices.deleteProject(999)).toBeNull();
    });
});