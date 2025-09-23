import os
import re
from flask import Flask, request, render_template, jsonify

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploaded_files'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def parse_kistler_csv(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    data = {
        "result_info": {},
        "evaluation_objects": [],
        "measuring_curve": {"X": [], "Y": []}
    }

    print("\n--- INÍCIO DO CONTEÚDO DO ARQUIVO (primeiros 500 chars) ---")
    print(content[:500])
    print("--- FIM DO CONTEÚDO DO ARQUIVO (primeiros 500 chars) ---\n")

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


    print("\n--- INICIANDO BUSCA POR 'Evaluation objects settings' ---")
    
    start_keyword = "Evaluation objects settings"
    end_keywords = ["Switch signal settings", "Device information", "Measuring curve"] 

    start_idx = -1
    content_lines = content.split('\n')
    for i, line in enumerate(content_lines):
        if line.strip().startswith(start_keyword):
            start_idx = i
            print(f"DEBUG: '{start_keyword}' encontrado na linha: {i+1}")
            break
    
    if start_idx != -1:
        end_idx = -1
        for i in range(start_idx + 1, len(content_lines)):
            if content_lines[i].strip() == "": 
                if i + 1 < len(content_lines) and content_lines[i+1].strip() == "":
                    end_idx = i
                    print(f"DEBUG: Duas linhas em branco encontradas após '{start_keyword}' na linha {i+1}.")
                    break
            
            found_end_keyword = False
            for keyword in end_keywords:
                if content_lines[i].strip().startswith(keyword):
                    end_idx = i
                    print(f"DEBUG: Palavra-chave '{keyword}' encontrada após '{start_keyword}' na linha {i+1}.")
                    found_end_keyword = True
                    break
            if found_end_keyword:
                break
        
        if end_idx == -1:
             print("DEBUG: Nenhum final explícito para 'Evaluation objects settings' encontrado. Usando o resto do arquivo.")
             eo_block_content = "\n".join(content_lines[start_idx:])
        else:
            eo_block_content = "\n".join(content_lines[start_idx:end_idx])

        print(f"DEBUG: Conteúdo bruto do bloco EO:\n{eo_block_content[:500]}...")
        
        eo_lines = eo_block_content.strip().split('\n')
        if len(eo_lines) > 1: 
            header_line = eo_lines[0]
            
        
            headers = [h.strip() for h in header_line.split(';') if h.strip()]
            start_data_line = 1 # Os dados começam da próxima linha

            print(f"Cabeçalhos dos EOs: {headers}") # Debug 3

            for line_num, line in enumerate(eo_lines[start_data_line:], start=1):
                parts = [p.strip() for p in line.split(';')]
                print(f"Linha EO {line_num} partes: {parts}") # Debug 4
                
                if len(parts) > 1: 
                    is_eo = parts[0].startswith('EO-')
                    reaction_value = parts[1]
                    is_not_off = reaction_value != 'OFF'
                    print(f"  Verificando Linha {line_num}: is_eo={is_eo}, reaction_value='{reaction_value}', is_not_off={is_not_off}") # Debug 5

                    if is_eo and is_not_off: 
                        eo_data = {}
                        for i, header in enumerate(headers):
                            if i < len(parts): 
                                value = parts[i]
                                if header in ['XMin', 'XMax', 'YMin', 'YMax', 'Y', 'X'] and isinstance(value, str) and ',' in value:
                                    value = value.replace(',', '.')
                                eo_data[header] = value
                        eo_data['EO_Identifier'] = parts[0]
                        data["evaluation_objects"].append(eo_data)
                        print(f"  EO adicionado: {eo_data['EO_Identifier']}") # Debug 6
                    else:
                        print(f"  Linha EO {line_num} ignorada devido à condição.") # Debug 7
                else:
                    print(f"  Linha EO {line_num} ignorada: Poucas partes ({len(parts)})") # Debug 8
        else:
            print(f"DEBUG: Seção '{start_keyword}' encontrada, mas sem linhas de dados após o cabeçalho.")
    else:
        print(f"--- FALHA: A palavra-chave '{start_keyword}' não foi encontrada no arquivo. ---")
    
    print("--- FIM DA BUSCA POR 'Evaluation objects settings' ---\n")


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
    
    print(f"--- DEBUG APP.PY: evaluation_objects final: {len(data['evaluation_objects'])} EOs ---")
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
