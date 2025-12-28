import googlemaps
from googleapiclient.discovery import build
from flask import Flask, request, jsonify
from flask_cors import CORS
import os
from dotenv import load_dotenv

# Carga variables de entorno (crea un archivo .env en esta carpeta backend)
load_dotenv()

app = Flask(__name__)
CORS(app)  # Permite que tu Next.js (puerto 3000) hable con este Python (puerto 5000)

# CLAVES API (Ponlas en tu .env o pégalas aquí temporalmente para probar)
GMAPS_KEY = os.getenv("GMAPS_KEY")
SEARCH_KEY = os.getenv("SEARCH_KEY")
SEARCH_ENGINE_ID = os.getenv("SEARCH_ENGINE_ID")

gmaps = googlemaps.Client(key=GMAPS_KEY) if GMAPS_KEY else None

@app.route('/api/search-places', methods=['POST'])
def search_places():
    if not gmaps:
        return jsonify({"error": "Falta API Key de Maps"}), 500
        
    data = request.json
    query = data.get('query', '')
    
    try:
        # Busca lugares reales en Google Maps
        results = gmaps.places(query=query)
        places = []
        
        for place in results['results'][:5]:
            places.append({
                "name": place['name'],
                "address": place.get('formatted_address'),
                "rating": place.get('rating', 'N/A'),
                "location": place['geometry']['location']
            })
            
        return jsonify({"type": "map_data", "data": places})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def home():
    return "Korsika Brain Online 🧠"

if __name__ == '__main__':
    app.run(debug=True, port=5000)