from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    database_url: str
    supabase_url: str
    supabase_secret_key: str

    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()