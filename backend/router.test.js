const request = require('supertest');
const express = require('express');
const router = require('./router');

const app = express();
app.use(express.json());
app.use('/', router);

describe('> API Endpoints & Validation Security Suite', () => {

    describe('User Routes & Security', () => {
        const testUser = {
            username: "Morpheus",
            email: "morpheus@zion.com",
            passwordHash: "redpill123", // Fixed 8+ char password
            experienceYears: 10
        };

        test('POST /api/users - Should create a valid new user', async () => {
            const res = await request(app).post('/api/users').send(testUser);
            expect(res.statusCode).toBe(201);
            expect(res.body.message).toBe("User successfully initialized.");
        });

        test('GET /api/users - Should return all users', async () => {
            const res = await request(app).get('/api/users');
            expect(res.statusCode).toBe(200);
            expect(res.body.data.length).toBeGreaterThan(0);
        });

        test('GET /api/users/:email - Should return specific user', async () => {
            const res = await request(app).get(`/api/users/${testUser.email}`);
            expect(res.statusCode).toBe(200);
            expect(res.body.data.email).toBe(testUser.email);
        });

        test('POST /api/users - Should block duplicate emails', async () => {
            const res = await request(app).post('/api/users').send(testUser);
            expect(res.statusCode).toBe(409);
        });

        test('POST /api/users - Should block short passwords', async () => {
            const badUser = { ...testUser, email: "new@zion.com", passwordHash: "short" };
            const res = await request(app).post('/api/users').send(badUser);
            expect(res.statusCode).toBe(400);
        });

        test('POST /api/login - Should authenticate valid credentials', async () => {
            const res = await request(app).post('/api/login').send({ email: testUser.email, password: testUser.passwordHash });
            expect(res.statusCode).toBe(200);
        });

        test('PUT /api/users/:email - Should update a user', async () => {
            const updatedData = { ...testUser, username: "Morpheus Updated" };
            const res = await request(app).put(`/api/users/${testUser.email}`).send(updatedData);
            expect(res.statusCode).toBe(200);
        });

        test('DELETE /api/users/:email - Should delete a user', async () => {
            const res = await request(app).delete(`/api/users/${testUser.email}`);
            expect(res.statusCode).toBe(200);
        });

        test('GET /api/users/:email - Should return 404 for non-existent user', async () => {
            const res = await request(app).get('/api/users/nobody@matrix.com');
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toContain("User not found");
        });

        test('PUT /api/users/:email - Should return 404 when updating non-existent user', async () => {
            const res = await request(app).put('/api/users/nobody@matrix.com').send(testUser);
            expect(res.statusCode).toBe(404);
        });

        test('DELETE /api/users/:email - Should return 404 when deleting non-existent user', async () => {
            const res = await request(app).delete('/api/users/nobody@matrix.com');
            expect(res.statusCode).toBe(404);
        });

        test('POST /api/login - Should block missing credentials (400 Bad Request)', async () => {
            const res = await request(app).post('/api/login').send({ email: testUser.email }); // Intentionally missing password
            expect(res.statusCode).toBe(400);
            expect(res.body.error).toContain("required");
        });

        test('POST /api/login - Should return 404 for non-existent user', async () => {
            const res = await request(app).post('/api/login').send({ email: "ghost@matrix.com", password: "password123" });
            expect(res.statusCode).toBe(404);
            expect(res.body.error).toContain("User not found");
        });
    });

    describe('Project Routes & Security', () => {
        let createdProjectId;
        const testProject = {
            title: "Nebuchadnezzar Refit",
            description: "Install new hover pads and EMP systems.",
            creatorEmail: "link@zion.com",
            tags: ["engineering", "urgent"],
            associatedFiles: [],
            associatedEmails: []
        };

        test('POST /api/projects - Should create a valid project', async () => {
            const res = await request(app).post('/api/projects').send(testProject);
            expect(res.statusCode).toBe(201);
            createdProjectId = res.body.data.id;
        });

        test('GET /api/projects - Should get all projects', async () => {
            const res = await request(app).get('/api/projects');
            expect(res.statusCode).toBe(200);
        });

        // Fetch it BEFORE we delete it!
        test('GET /api/projects/:email - Should get projects for a specific user', async () => {
            const res = await request(app).get(`/api/projects/${testProject.creatorEmail}`);
            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].creatorEmail).toBe(testProject.creatorEmail);
        });

        test('GET /api/projects/:email - Should return 404 if user has no projects', async () => {
            const res = await request(app).get('/api/projects/nobody@zion.com');
            expect(res.statusCode).toBe(404);
        });

        test('POST /api/projects - Should block projects with no tags', async () => {
            const badProject = { ...testProject, tags: [] };
            const res = await request(app).post('/api/projects').send(badProject);
            expect(res.statusCode).toBe(400);
        });

        test('PUT /api/projects/:id - Should update a valid project', async () => {
            const updatedData = { ...testProject, id: createdProjectId, title: "Refit Complete" };
            const res = await request(app).put(`/api/projects/${createdProjectId}`).send(updatedData);
            expect(res.statusCode).toBe(200);
        });

        test('PUT /api/projects/:id - Should return 404 for non-existent project', async () => {
            const res = await request(app).put('/api/projects/999999').send({...testProject, title: "Valid Title"});
            expect(res.statusCode).toBe(404);
        });

        // Delete it at the VERY END!
        test('DELETE /api/projects/:id - Should delete the project', async () => {
            const res = await request(app).delete(`/api/projects/${createdProjectId}`);
            expect(res.statusCode).toBe(200);
        });

        test('DELETE /api/projects/:id - Should return 404 for non-existent project', async () => {
            const res = await request(app).delete('/api/projects/999999');
            expect(res.statusCode).toBe(404);
        });
    });

    describe('Task Routes & Security', () => {
        let createdTaskId;
        const testTask = {
            title: "Locate Oracle",
            description: "Find the Oracle in the Matrix to get instructions.",
            creatorEmail: "neo@zion.com",
            projectId: 1,
            status: "pending",
            tags: ["urgent"],
            end: "2026-04-01"
        };

        test('POST /api/tasks - Should create a valid task', async () => {
            const res = await request(app).post('/api/tasks').send(testTask);
            expect(res.statusCode).toBe(201);
            createdTaskId = res.body.data.id;
        });

        test('GET /api/tasks - Should get all tasks', async () => {
            const res = await request(app).get('/api/tasks');
            expect(res.statusCode).toBe(200);
        });

        // Fetch it BEFORE we delete it!
        test('GET /api/tasks/:email - Should get tasks for a specific user', async () => {
            const res = await request(app).get(`/api/tasks/${testTask.creatorEmail}`);
            expect(res.statusCode).toBe(200);
            expect(res.body.data[0].creatorEmail).toBe(testTask.creatorEmail);
        });

        test('GET /api/tasks/:email - Should return 404 if user has no tasks', async () => {
            const res = await request(app).get('/api/tasks/nobody@zion.com');
            expect(res.statusCode).toBe(404);
        });

        test('POST /api/tasks - Should block tasks missing a Project ID', async () => {
            const badTask = { ...testTask, projectId: null };
            const res = await request(app).post('/api/tasks').send(badTask);
            expect(res.statusCode).toBe(400);
        });

        test('PUT /api/tasks/:id - Should update a valid task', async () => {
            const updatedTask = { ...testTask, id: createdTaskId, status: "completed" };
            const res = await request(app).put(`/api/tasks/${createdTaskId}`).send(updatedTask);
            expect(res.statusCode).toBe(200);
        });

        test('PUT /api/tasks/:id - Should return 404 for non-existent task', async () => {
            const res = await request(app).put('/api/tasks/999999').send({...testTask, status: "completed"});
            expect(res.statusCode).toBe(404);
        });

        // Delete it at the VERY END!
        test('DELETE /api/tasks/:id - Should delete the task', async () => {
            const res = await request(app).delete(`/api/tasks/${createdTaskId}`);
            expect(res.statusCode).toBe(200);
        });

        test('DELETE /api/tasks/:id - Should return 404 for non-existent task', async () => {
            const res = await request(app).delete('/api/tasks/999999');
            expect(res.statusCode).toBe(404);
        });
    });
});