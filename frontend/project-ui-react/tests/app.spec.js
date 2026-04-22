import { test, expect } from '@playwright/test';

// Make sure this matches your React app's port! (Vite is usually 5173, Create React App is 3000)
const APP_URL = 'http://localhost:5173'; 

test.describe('ProjectUi Core Features', () => {

  // FEATURE 1: Authentication & Routing
  test('User can log in, pass presentation, and reach the Home dashboard', async ({ page }) => {
    await page.goto(`${APP_URL}/login`);
    
    // 1. Simulate user typing their email and password
    await page.fill('input[type="email"]', 'taschina529@gmail.com');
    await page.fill('input[type="password"]', '12345678');
    
    // 2. Click the login button
    await page.click('button:has-text("Authenticate")');
    
    // 3. --- THE PRESENTATION PAGE ---
    // Change "Enter App" to the exact text on your actual button!
    await page.click('button:has-text("Enter Workspace")'); 
    
    // 4. Assert that the app successfully reached the Home page
    await expect(page).toHaveURL(`${APP_URL}/home`);
    await expect(page.locator('h2:has-text("> Active Tasks Queue")')).toBeVisible();
  });

  // FEATURE 2: Task Creation Flow
  test('User can create a new task in the Workspace', async ({ page }) => {
    // Inject the auth token into localStorage so we don't have to log in again
    await page.addInitScript(() => {
      localStorage.setItem('loggedInUserEmail', 'testuser@luca.com');
    });
    
    await page.goto(`${APP_URL}/workspace`);
    
    // Open the modal
    await page.click('button:has-text("+ Add New Task")');
    await expect(page.locator('h2:has-text("Add New Task Popup")')).toBeVisible();
    
    // Fill out the form
    await page.fill('input[placeholder="e.g., bug|frontend|urgent"]', 'frontend|testing');
    
    // Click save
    await page.click('button:has-text("Save Entity")');
    
    // Assert the modal closed
    await expect(page.locator('h2:has-text("Add New Task Popup")')).toBeHidden();
  });

  // FEATURE 3: AI Microservice Integration
  test('User can trigger the AI Time Predictor', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('loggedInUserEmail', 'testuser@luca.com');
    });
    
    await page.goto(`${APP_URL}/workspace`);
    await page.click('button:has-text("+ Add New Task")');
    
    // Fill in the requirements for the AI
    await page.locator('label:has-text("Task Name") + input').fill('Build Login Screen');
    await page.fill('input[placeholder="e.g., bug|frontend|urgent"]', 'frontend|auth');
    
    // Click the AI Button
    const aiButton = page.locator('button:has-text("🧠 Ask AI")');
    await aiButton.click();
    
    // Assert that the button text changes to "Thinking..."
    await expect(page.locator('button:has-text("Thinking...")')).toBeVisible();
    
    // Wait for the AI to respond and check if the input gets populated with a number
    const predictionInput = page.locator('label:has-text("Predicted Hours (AI)") + div > input');
    await expect(predictionInput).not.toHaveValue('', { timeout: 10000 }); // Wait up to 10 seconds for Flask
  });

});