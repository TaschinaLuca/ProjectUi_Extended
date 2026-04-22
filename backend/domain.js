class Tasks {
    constructor(id, title, description, creatorEmail, projectId, status, tags, end) {
        this.id = id; 
        this.title = title;
        this.description = description;
        this.creatorEmail = creatorEmail;
        this.projectId = projectId;
        this.status = status;
        this.tags = tags;
        this.start = new Date();
        this.end = end;
    }
}

class Project {
    constructor(id, title, description, creatorEmail, associatedFiles, associatedEmails) {
        this.id = id; 
        this.title = title;
        this.description = description;
        this.creatorEmail = creatorEmail;
        this.createdAt = new Date();
        this.associatedFiles = associatedFiles;
        this.associatedEmails = associatedEmails;
    }
}

class User{
    constructor(username, email, passwordHash, experienceYears) {
        this.username = username;
        this.email = email;
        this.passwordHash = passwordHash;
        this.experienceYears = experienceYears;
    }
}

module.exports = {Project, Tasks, User};