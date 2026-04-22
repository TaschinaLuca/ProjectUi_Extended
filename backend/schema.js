const { User, Tasks, Project } = require('./domain');
const { faker } = require('@faker-js/faker');

// 1. DEFINE THE GRAPHQL SCHEMA (Types, Queries, and Mutations)
const typeDefs = `#graphql
  type User {
    username: String!
    email: String!
    experienceYears: Int!
  }

  type Task {
    id: ID!
    projectId: Int!
    title: String!
    description: String!
    creatorEmail: String!
    status: String!
    completed: Boolean!
    tags: [String!]!
    start: String!
    end: String!
    predicted: Float!
  }

  type Project {
    id: ID!
    title: String!
    description: String!
    creatorEmail: String!
    tags: [String!]!
    associatedFiles: [String!]
    associatedEmails: [String!]
  }

  type AuthPayload {
    message: String!
    data: User
  }

  type Query {
    users: [User!]!
    user(email: String!): User
    tasks: [Task!]!
    tasksByUser(email: String!): [Task!]!
    projects: [Project!]!
    projectsByUser(email: String!): [Project!]!
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

// 2. DEFINE THE RESOLVERS (The Business Logic)
let generatorInterval = null;

const resolvers = {
  Query: {
    users: (_, __, { appServices }) => appServices.getAllUsers(),
    user: (_, { email }, { appServices }) => appServices.getUserByEmail(email),
    tasks: (_, __, { appServices }) => appServices.getAllTasks(),
    tasksByUser: (_, { email }, { appServices }) => appServices.getTasksByUserEmail(email),
    projects: (_, __, { appServices }) => appServices.getAllProjects(),
    projectsByUser: (_, { email }, { appServices }) => appServices.getProjectsByUserEmail(email),
  },

  Mutation: {
    // --- AUTH ---
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

    // --- TASKS ---
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

    // --- PROJECTS ---
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

    // --- GENERATOR ---
    startGenerator: (_, { email }, { appServices, broadcast }) => {
      if (generatorInterval) throw new Error("Generator is already running.");
      console.log(`> BACKGROUND GENERATOR: STARTED FOR [${email}]`);

      generatorInterval = setInterval(() => {
        // Create the project using the passed `email`
        const fakeProject = new Project(0, faker.company.name() + " Init", faker.company.catchPhrase(), email, [], []);
        fakeProject.tags = ["auto-generated"];
        appServices.addProject(fakeProject);

        const newTasks = [];
        const taskCount = Math.floor(Math.random() * 3) + 1;
        for (let i = 0; i < taskCount; i++) {
          // 1. Create a 40% chance that the generated task is completed
          const isCompleted = Math.random() > 0.6; 
          
          // 2. Generate logical dates based on completion status
          let taskDeadline;
          if (isCompleted) {
             // If completed, the deadline was somewhere in the last 7 days
             taskDeadline = faker.date.recent({ days: 7 }).toISOString().split('T')[0];
          } else {
             // If pending, there's a chance it missed the deadline (past) or is due soon (future)
             taskDeadline = Math.random() > 0.5 
                ? faker.date.recent({ days: 2 }).toISOString().split('T')[0] // Missed deadline
                : faker.date.soon({ days: 10 }).toISOString().split('T')[0]; // Due in the future
          }

          // 3. Pass the dynamic status and deadline to the constructor
          const fakeTask = new Tasks(
            0, 
            faker.hacker.verb() + " " + faker.hacker.noun(), 
            faker.lorem.sentence(), 
            email, 
            fakeProject.id, 
            isCompleted ? "completed" : "pending", 
            ["auto-generated"], 
            taskDeadline
          );
          
          // 4. Override the start date so it logically happens before the deadline
          const startOffset = new Date(taskDeadline);
          startOffset.setDate(startOffset.getDate() - faker.number.int({ min: 2, max: 10 }));
          fakeTask.start = startOffset.toISOString().split('T')[0];
          
          // 5. Ensure GraphQL strict fields are populated!
          fakeTask.completed = isCompleted;
          fakeTask.predicted = faker.number.int({ min: 1, max: 20 });
          
          appServices.addTask(fakeTask);
          newTasks.push(fakeTask);
        }

        // Broadcast to clients
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