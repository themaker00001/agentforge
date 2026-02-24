"""
Power BI Execution Agent
Handles Interactive Device Code Flow and executing Power BI APIs.
"""

from __future__ import annotations
import asyncio
import os
import requests
from msal import PublicClientApplication

from app.models.schema import Node
from app.models.schema import LogType

POWERBI_CLIENT_ID = os.getenv("POWERBI_CLIENT_ID", "dummy-client-id-if-not-set")
AUTHORITY = "https://login.microsoftonline.com/organizations"
SCOPES = ["https://analysis.windows.net/powerbi/api/.default"]

app = PublicClientApplication(POWERBI_CLIENT_ID, authority=AUTHORITY)

async def run_powerbi_node(node: Node, context: str):
    """
    Executes a Power BI node.
    Yields events so the executor can stream them back to the UI.
    Finally yields the result.
    """
    workspace_id = node.data.pbiWorkspaceId
    dataset_id = node.data.pbiDatasetId
    action = node.data.pbiAction or "dax_query"
    query = node.data.pbiQuery or context

    yield {"type": LogType.info, "message": f"Action: {action}, Workspace: {workspace_id}"}

    # 1. Start Device Code Auth
    flow = app.initiate_device_flow(scopes=SCOPES)
    if "user_code" not in flow:
        yield {"type": LogType.err, "message": "Failed to initiate device code flow."}
        yield {"type": "result", "message": "Auth Error"}
        return

    # Yield the auth message so UI can show it
    auth_msg = flow["message"]
    yield {"type": "auth_required", "message": auth_msg, "data": {
        "user_code": flow["user_code"],
        "verification_uri": flow["verification_uri"]
    }}

    # Wait for user to authenticate
    # `acquire_token_by_device_flow` blocks. We need to run it in a thread so we don't block the async loop.
    yield {"type": LogType.info, "message": "Waiting for user authentication..."}
    
    def wait_for_token():
        return app.acquire_token_by_device_flow(flow)
        
    result = await asyncio.to_thread(wait_for_token)
    
    if "access_token" not in result:
        err = result.get("error_description", "Unknown error")
        yield {"type": LogType.err, "message": f"Authentication failed: {err}"}
        yield {"type": "result", "message": "Auth Error"}
        return

    access_token = result["access_token"]
    yield {"type": LogType.info, "message": "Authentication successful. Executing Power BI action..."}

    # 2. Execute Action
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json"
    }

    try:
        def do_request():
            if action == "dax_query":
                url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id}/datasets/{dataset_id}/executeQueries"
                payload = {
                    "queries": [{"query": query}],
                    "serializerSettings": {"includeNulls": True}
                }
                res = requests.post(url, headers=headers, json=payload)
                res.raise_for_status()
                return str(res.json())
            elif action == "refresh":
                url = f"https://api.powerbi.com/v1.0/myorg/groups/{workspace_id}/datasets/{dataset_id}/refreshes"
                res = requests.post(url, headers=headers, json={})
                res.raise_for_status()
                return "Dataset refresh triggered successfully."
            else:
                return f"Unknown action: {action}"
                
        api_result = await asyncio.to_thread(do_request)
        yield {"type": "result", "message": api_result}
        
    except Exception as e:
        yield {"type": LogType.err, "message": f"Power BI API error: {e}"}
        yield {"type": "result", "message": f"Error: {e}"}
