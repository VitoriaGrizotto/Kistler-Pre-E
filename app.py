import os
import re
from flask import Flask, request, render_template, jsonify

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploaded_files'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 #Definindo o tamanho maximo do arquivo

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def parse_kistler_csv(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    data = {
        "result_info": {},
        "evaluation_objects": [],
        "measuring_curve": {"X": [], "Y": []}
    }

    result_info_match = re.search(r'Result information\n(.*?)(?=\n\n|\nProcess values)', content, re.DOTALL)
    if result_info_match:
        info_lines = result_info_match.group(1).strip().split('\n')
        for line in info_lines:
            if ';' in line:
                key, value = line.split(';', 1)
                data["result_info"][key.strip()] = value.strip()

    essential_keys = ["Date", "Time", "Total result", "Part serial number", "Measuring program name"]
    for key in essential_keys:
        data["result_info"][key] = data["result_info"].get(key, "N/A")

    eo_settings_match = re.search(r'Evaluation objects settings\n(.*?)(?=\n\n|\nSwitch signal settings)', content, re.DOTALL)
    if eo_settings_match:
        eo_lines = eo_settings_match.group(1).strip().split('\n')
        if len(eo_lines) > 1:
            header_line = eo_lines[0]
            headers = [h.strip() for h in header_line.split(';') if h.strip()]

            for line in eo_lines[1:]:
                parts = [p.strip() for p in line.split(';')]
                if len(parts) > 1 and parts[0].startswith('EO-') and parts[1] != 'OFF':
                    eo_data = {}
                    for i, header in enumerate(headers):
                        if i < len(parts):
                            eo_data[header] = parts[i]
                    data["evaluation_objects"].append(eo_data)

    measuring_curve_start = content.find('Measuring curve')
    if measuring_curve_start != -1:
        data_header_start = content.find('s;mm;N;mm', measuring_curve_start)
        if data_header_start != -1:
            data_start_idx = content.find('\n', data_header_start) + 1
            if data_start_idx > 0:
                curve_data_raw = content[data_start_idx:].strip()

                for line in curve_data_raw.split('\n'):
                    parts = line.strip().split(';')
                    if len(parts) >= 3:
                        try:
                            data["measuring_curve"]["X"].append(float(parts[1].replace(',', '.')))
                            data["measuring_curve"]["Y"].append(float(parts[2].replace(',', '.')))
                        except (ValueError, IndexError):
                            continue

    return data


@app.route('/')
def index():
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_file():
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    filepath = os.path.join(app.config['UPLOAD_FOLDER'], file.filename)
    try:
        file.save(filepath)
        parsed_data = parse_kistler_csv(filepath)
        return jsonify(parsed_data), 200
    except Exception as e:
        app.logger.error(f"Error processing file {file.filename}: {e}")
        return jsonify({"error": f"Error parsing file: {str(e)}"}), 500
    finally:
        if os.path.exists(filepath):
            os.remove(filepath)


if __name__ == '__main__':
    app.run(debug=True)
