from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    # accepte les variables du fichier .env et ignore celles qu'on ne déclare pas (ex: amadeus_api_key)
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # valeurs par défaut pour un démarrage local
    DATABASE_URL: str = Field(default="sqlite:///./local.db")
    AUTH_JWT_SECRET: str = Field(default="devsecret-change-me")
    AUTH_JWT_ALG: str = "HS256"

settings = Settings()