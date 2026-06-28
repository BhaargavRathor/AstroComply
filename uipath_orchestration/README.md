# AstroComply AI - UiPath Orchestration Workflow

This directory contains the ready-to-import **UiPath Studio project** for the AstroComply AI compliance orchestration flow. It is built as a Modern Workflow implementing the multi-step BPMN orchestration pipeline.

## Project Structure

- **[project.json](file:///C:/Users/BHAARGAV/.gemini/antigravity/scratch/MOSIP1/uipath_orchestration/project.json)**: The UiPath project configuration defining workflow dependencies including WebAPI and System activities.
- **[Main.xaml](file:///C:/Users/BHAARGAV/.gemini/antigravity/scratch/MOSIP1/uipath_orchestration/Main.xaml)**: The actual workflow BPMN diagram defining variable scopes, sequence logic, decision gates, and API interaction points.

## How to Import and Deploy in UiPath Automation Cloud

1. **Open in UiPath Studio**:
   - Launch **UiPath Studio** (ensure you are logged into your Automation Cloud tenant).
   - Click **Open Local Project** and select the [project.json](file:///C:/Users/BHAARGAV/.gemini/antigravity/scratch/MOSIP1/uipath_orchestration/project.json) file in this directory.

2. **Configure API Base URL**:
   - In the **Variables** panel of `Main.xaml`, find the `ApiBaseUrl` variable.
   - Set its default value to your public deployed FastAPI backend URL (e.g., `https://astrocomply-api.render.com` or your local development URL during testing).

3. **Verify Dependencies**:
   - UiPath Studio will automatically restore the dependencies specified in the project file (e.g., `UiPath.WebAPI.Activities` for HTTP Client calls).

4. **Orchestrator Setup & Publishing**:
   - Click **Publish** in the top ribbon of UiPath Studio.
   - Choose **Orchestrator Tenant Process Feed** as the destination.
   - Click **Publish** to upload the package.

5. **Deploy the Process**:
   - Log in to your **UiPath Automation Cloud** web portal.
   - Navigate to **Orchestrator** -> **Processes**.
   - Click **Add Process**, select `AstroComplyAI_Orchestrator`, and associate it with a folder/environment.

6. **Triggering Orchestration**:
   - The process can now be triggered dynamically via UiPath Orchestrator API webhooks or scheduled via Orchestrator Triggers whenever new satellite proposals are uploaded.
