const { User, Tasks, Project } = require('./domain');
const { faker } = require('@faker-js/faker');

// 1. DEFINE THE GRAPHQL SCHEMA
const typeDefs = `#graphql
  type User { username: String!, email: String!, experienceYears: Int! }
  type Task { id: ID!, projectId: Int!, title: String!, description: String!, creatorEmail: String!, status: String!, completed: Boolean!, tags: [String!]!, start: String!, end: String!, predicted: Float! }
  type Project { id: ID!, title: String!, description: String!, creatorEmail: String!, tags: [String!]!, associatedFiles: [String!], associatedEmails: [String!] }
  type AuthPayload { message: String!, data: User }

  type Query {
    users: [User!]!
    user(email: String!): User
    tasks: [Task!]!
    # --- UPDATED: Added limit and offset arguments ---
    tasksByUser(email: String!, limit: Int, offset: Int): [Task!]!
    projects: [Project!]!
    projectsByUser(email: String!, limit: Int, offset: Int): [Project!]!
  }

  type Mutation {
    login(email: String!, passwordHash: String!): AuthPayload!
    register(username: String!, email: String!, passwordHash: String!, experienceYears: Int!): AuthPayload!
    createTask(projectId: Int!, title: String!, description: String!, creatorEmail: String!, status: String!, completed: Boolean!, tags: [String!]!, end: String!, predicted: Float!): Task!
    updateTask(id: ID!, projectId: Int, title: String, description: String, status: String, completed: Boolean, tags: [String!], end: String, predicted: Float): Task!
    deleteTask(id: ID!): String!
    createProject(title: String!, description: String!, creatorEmail: String!, tags: [String!]!, associatedFiles: String, associatedEmails: String): Project!
    deleteProject(id: ID!): String!
    updateProject(id: ID!, title: String, description: String, tags: [String!], associatedFiles: String, associatedEmails: String): Project!
    startGenerator(email: String!): String!
    stopGenerator: String!
  }
`;

let generatorInterval = null;

const resolvers = {
  Query: {
    users: (_, __, { appServices }) => appServices.getAllUsers(),
    user: (_, { email }, { appServices }) => appServices.getUserByEmail(email),
    tasks: (_, __, { appServices }) => appServices.getAllTasks(),
    projects: (_, __, { appServices }) => appServices.getAllProjects(),
    
    // --- UPDATED: Pass limit and offset to services ---
    tasksByUser: (_, { email, limit, offset }, { appServices }) => appServices.getTasksByUserEmail(email, limit, offset),
    projectsByUser: (_, { email, limit, offset }, { appServices }) => appServices.getProjectsByUserEmail(email, limit, offset),
  },

  Mutation: {
    login: (_, { email, passwordHash }, { appServices }) => {
      const user = appServices.getUserByEmail(email);
      if (!user) throw new Error("User not found.");
      if (user.passwordHash !== passwordHash) throw new Error("Invalid password.");
      return { message: "Authentication successful.", data: user };
    },
    register: (_, { username, email, passwordHash, experienceYears }, { appServices }) => {
      if (appServices.getUserByEmail(email)) throw new Error("User already exists.");
      const newUser = new User(username, email, passwordHash, experienceYears);
      appServices.addUser(newUser);
      return { message: "User successfully initialized.", data: newUser };
    },
    createTask: (_, args, { appServices }) => {
      const newTask = new Tasks(0, args.title, args.description, args.creatorEmail, args.projectId, args.status, args.tags, args.end);
      newTask.completed = args.completed;
      newTask.predicted = args.predicted;
      appServices.addTask(newTask);
      return newTask;
    },
    updateTask: (_, args, { appServices }) => {
      const existing = appServices.getTaskById(parseInt(args.id));
      if (!existing) throw new Error("Task not found.");
      const updated = { ...existing, ...args };
      appServices.updateTask(parseInt(args.id), updated);
      return updated;
    },
    deleteTask: (_, { id }, { appServices }) => {
      appServices.deleteTask(parseInt(id));
      return `Task [${id}] erased.`;
    },
    createProject: (_, args, { appServices }) => {
      const newProj = new Project(0, args.title, args.description, args.creatorEmail, args.associatedFiles ? args.associatedFiles.split(',') : [], args.associatedEmails ? args.associatedEmails.split(',') : []);
      newProj.tags = args.tags;
      appServices.addProject(newProj);
      return newProj;
    },
    deleteProject: (_, { id }, { appServices }) => {
      appServices.deleteProject(parseInt(id));
      return `Project [${id}] erased.`;
    },
    updateProject: (_, args, { appServices }) => {
        const existing = appServices.getProjectById(parseInt(args.id));
        if (!existing) throw new Error("Project not found.");
        const updated = { ...existing, ...args, tags: args.tags || existing.tags, associatedFiles: args.associatedFiles ? args.associatedFiles.split(',') : existing.associatedFiles, associatedEmails: args.associatedEmails ? args.associatedEmails.split(',') : existing.associatedEmails };
        appServices.updateProject(parseInt(args.id), updated);
        return updated;
    },
    startGenerator: (_, { email }, { appServices, broadcast }) => {
      if (generatorInterval) throw new Error("Generator is already running.");
      console.log(`> BACKGROUND GENERATOR: STARTED FOR [${email}]`);

      generatorInterval = setInterval(() => {
        const fakeProject = new Project(0, faker.company.name() + " Init", faker.company.catchPhrase(), email, [], []);
        fakeProject.tags = ["auto-generated"];
        appServices.addProject(fakeProject);

        const newTasks = [];
        const taskCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < taskCount; i++) {
          const isCompleted = Math.random() > 0.6; 
          let taskDeadline = isCompleted 
             ? faker.date.recent({ days: 7 }).toISOString().split('T')[0]
             : (Math.random() > 0.5 ? faker.date.recent({ days: 2 }).toISOString().split('T')[0] : faker.date.soon({ days: 10 }).toISOString().split('T')[0]);

          const fakeTask = new Tasks(0, faker.hacker.verb() + " " + faker.hacker.noun(), faker.lorem.sentence(), email, fakeProject.id, isCompleted ? "completed" : "pending", ["auto-generated"], taskDeadline);
          const startOffset = new Date(taskDeadline);
          startOffset.setDate(startOffset.getDate() - faker.number.int({ min: 2, max: 10 }));
          fakeTask.start = startOffset.toISOString().split('T')[0];
          
          fakeTask.completed = isCompleted;
          fakeTask.predicted = faker.number.int({ min: 1, max: 20 });
          
          appServices.addTask(fakeTask);
          newTasks.push(fakeTask);
        }
        broadcast({ type: 'NEW_BATCH', projects: [fakeProject], tasks: newTasks });
      }, 4000);
      return "Generator sequence started.";
    },
    stopGenerator: () => {
      if (generatorInterval) {
        clearInterval(generatorInterval);
        generatorInterval = null;
        console.log("> BACKGROUND GENERATOR: STOPPED");
      }
      return "Generator sequence stopped.";
    }
  }
};

module.exports = { typeDefs, resolvers };