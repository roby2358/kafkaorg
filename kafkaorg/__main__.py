"""Run the FastAPI development server"""
import uvicorn

def main():
    """Entry point for the dev script"""
    uvicorn.run(
        "app:app",
        host="0.0.0.0",
        port=8821,
        reload=True,
    )

if __name__ == "__main__":
    main()
