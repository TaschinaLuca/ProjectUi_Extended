class Services{
    #users = [];
    #tasks = [];
    #projects = [];
    #newProjectId = 1;
    #newTaskId = 1;

    constructor(){
    }

    addUser(newUser){
        this.#users.push(newUser);
    }

    addTask(newTask){
        newTask.id = this.#newTaskId;
        this.#newTaskId++;
        this.#tasks.push(newTask);
    }

    addProject(newProject){
        newProject.id = this.#newProjectId;
        this.#newProjectId++;
        this.#projects.push(newProject);
    }

    getAllUsers(){
        return this.#users;
    }

    getAllTasks(){
        return this.#tasks;
    }

    getAllProjects(){
        return this.#projects;
    }

    getUserByEmail(email){
        return this.#users.find(user => user.email === email);
    }

    getTaskById(id){
        return this.#tasks.find(task => task.id === id);
    }

    getProjectById(id){
        return this.#projects.find(project => project.id === id);
    }

    getProjectsByUserEmail(userEmail, limit, offset){
        const results = this.#projects.filter(project => project.creatorEmail === userEmail);
        
        // Use != null to catch BOTH null and undefined from GraphQL
        if (limit != null && offset != null) {
            return results.slice(offset, offset + limit);
        }
        return results;
    }

    getTasksByUserEmail(userEmail, limit, offset){
        const results = this.#tasks.filter(task => task.creatorEmail === userEmail);
        
        // Use != null to catch BOTH null and undefined from GraphQL
        if (limit != null && offset != null) {
            return results.slice(offset, offset + limit);
        }
        return results;
    }

    getTasksByProjectId(projectId){
        return this.#tasks.filter(task => task.projectId === projectId);
    }

    updateUser(email, updatedUser){
        const index = this.#users.findIndex(user => user.email === email);
        if(index !== -1){
            this.#users[index] = updatedUser;
            return this.#users[index];
        }
        return null;
    }

    updateProject(id, updatedProject){
        const index = this.#projects.findIndex(project => project.id === id);
        if(index !== -1){
            this.#projects[index] = updatedProject;
            return this.#projects[index];
        }
        return null;
    }

    updateTask(id, updatedTask){
        const index = this.#tasks.findIndex(task => task.id === id);
        if(index !== -1){
            this.#tasks[index] = updatedTask;
            return this.#tasks[index];
        }
        return null;
    }

    deleteUser(email){
        const index = this.#users.findIndex(user => user.email === email);
        if(index !== -1){
            return this.#users.splice(index, 1)[0];
        }
        return null;
    }

    deleteProject(id){
        const index = this.#projects.findIndex(project => project.id === id);
        if(index !== -1){
            this.#tasks = this.#tasks.filter(task => task.projectId !== id);
            return this.#projects.splice(index, 1)[0];
        }
        return null;
    }

    deleteTask(id){
        const index = this.#tasks.findIndex(task => task.id === id);
        if(index !== -1){
            return this.#tasks.splice(index, 1)[0];
        }
        return null;
    }
}

module.exports = Services;