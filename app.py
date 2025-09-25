import os
import re
from flask import Flask, request, render_template, jsonify

app = Flask(__name__)
app.config['UPLOAD_FOLDER'] = 'uploaded_files'
app.config['MAX_CONTENT_LENGTH'] = 16 * 1024 * 1024 

os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

def _safe_float(value):
    try:
        if value is None:
            return None
        if isinstance(value, (int, float)):
            return float(value)
        v = str(value).strip()
        if v == '':
            return None
        v = v.replace(',', '.')
        return float(v)
    except Exception:
        return None

def parse_kistler_csv(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    data = {
        "result_info": {},
        "evaluation_objects": [],
        "measuring_curve": {"X": [], "Y": []}
    }

    # --- Result information
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

    # --- Evaluation objects
    start_keyword = "Evaluation objects settings"
    end_keywords = ["Switch signal settings", "Device information", "Measuring curve"] 

    start_idx = -1
    content_lines = content.split('\n')
    for i, line in enumerate(content_lines):
        if line.strip().startswith(start_keyword):
            start_idx = i
            break
    
    if start_idx != -1:
        end_idx = -1
        for i in range(start_idx + 1, len(content_lines)):
            # stop if we hit one of the known end keywords
            for keyword in end_keywords:
                if content_lines[i].strip().startswith(keyword):
                    end_idx = i
                    break
            if end_idx != -1:
                break
        
        if end_idx == -1:
            eo_block_content = "\n".join(content_lines[start_idx:])
        else:
            eo_block_content = "\n".join(content_lines[start_idx:end_idx])

        eo_lines = eo_block_content.strip().split('\n')
        if len(eo_lines) > 1:
            header_line = eo_lines[0]
            headers = [h.strip() for h in header_line.split(';') if h.strip()]
            start_data_line = 1
            for line_num, line in enumerate(eo_lines[start_data_line:], start=1):
                parts = [p.strip() for p in line.split(';')]
                if len(parts) > 1:
                    # expect first column is EO identifier, second is Reaction
                    is_eo = parts[0].startswith('EO-')
                    reaction_value = parts[1] if len(parts) > 1 else ''
                    is_not_off = reaction_value != 'OFF'
                    if is_eo and is_not_off:
                        eo_data = {}
                        for i_h, header in enumerate(headers):
                            if i_h < len(parts):
                                value = parts[i_h]
                                # normalize decimal comma to point
                                if isinstance(value, str) and ',' in value:
                                    value = value.replace(',', '.')
                                eo_data[header] = value
                        eo_data['EO_Identifier'] = parts[0]
                        data["evaluation_objects"].append(eo_data)
        # else: no data lines after header -> skip
    # else: not found -> skip EOs

    # --- Measuring curve
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
                            x_val = parts[1].replace(',', '.')
                            y_val = parts[2].replace(',', '.')
                            data["measuring_curve"]["X"].append(float(x_val))
                            data["measuring_curve"]["Y"].append(float(y_val))
                        except (ValueError, IndexError):
                            continue

    # --- Avaliar cada EO com base na curva (adiciona campos ao EO)
    xs = data["measuring_curve"]["X"]
    ys = data["measuring_curve"]["Y"]
    curve_points = list(zip(xs, ys))

    for eo in data["evaluation_objects"]:
        reaction = eo.get('Reaction', '')
        eo_id = eo.get('EO_Identifier', 'EO-UNKNOWN')
        # parse numeric values
        x_min = _safe_float(eo.get('XMin'))
        x_max = _safe_float(eo.get('XMax'))
        y_min = _safe_float(eo.get('YMin'))
        y_max = _safe_float(eo.get('YMax'))
        y_ref = _safe_float(eo.get('Y'))  # sometimes used
        x_ref = _safe_float(eo.get('X'))

        eo_result = {
            "evaluation_result": "UNKNOWN",
            "evaluation_reason": "",
            "x_cross": None,
            "y_cross": None
        }

        # if no curve data, can't evaluate
        if not curve_points:
            eo_result["evaluation_result"] = "UNKNOWN"
            eo_result["evaluation_reason"] = "No curve data to evaluate"
            eo.update(eo_result)
            continue

        # LINE-X: need to reach YMin inside [XMin, XMax]
        if reaction == 'LINE-X':
            if x_min is None or x_max is None or y_min is None:
                eo_result["evaluation_result"] = "UNKNOWN"
                eo_result["evaluation_reason"] = "Missing XMin/XMax/YMin"
            else:
                crossed_inside = None
                crossed_outside = None
                for x, y in curve_points:
                    if y >= y_min:
                        if x_min <= x <= x_max:
                            crossed_inside = (x, y)
                            break
                        else:
                            # mark first crossing outside
                            if crossed_outside is None:
                                crossed_outside = (x, y)
                if crossed_inside:
                    eo_result["evaluation_result"] = "OK"
                    eo_result["evaluation_reason"] = f"Reached YMin ({y_min}) inside interval"
                    eo_result["x_cross"] = crossed_inside[0]
                    eo_result["y_cross"] = crossed_inside[1]
                elif crossed_outside:
                    eo_result["evaluation_result"] = "NOK_OUT_OF_RANGE"
                    eo_result["evaluation_reason"] = f"Reached YMin ({y_min}) but outside X-range"
                    eo_result["x_cross"] = crossed_outside[0]
                    eo_result["y_cross"] = crossed_outside[1]
                else:
                    eo_result["evaluation_result"] = "NOK"
                    eo_result["evaluation_reason"] = f"Did not reach YMin ({y_min})"
        # NO-PASS: must NOT exceed YMax inside [XMin, XMax]
        elif reaction == 'NO-PASS':
            # For NO-PASS, CSV might put the limit in YMin or YMax column; check both
            limit = y_max if y_max is not None else y_min
            if x_min is None or x_max is None or limit is None:
                eo_result["evaluation_result"] = "UNKNOWN"
                eo_result["evaluation_reason"] = "Missing XMin/XMax/YMax (limit)"
            else:
                exceeded_inside = None
                exceeded_outside = None
                for x, y in curve_points:
                    if y > limit:
                        if x_min <= x <= x_max:
                            exceeded_inside = (x, y)
                            break
                        else:
                            if exceeded_outside is None:
                                exceeded_outside = (x, y)
                if exceeded_inside:
                    eo_result["evaluation_result"] = "NOK"
                    eo_result["evaluation_reason"] = f"Exceeded limit ({limit}) inside X-range"
                    eo_result["x_cross"] = exceeded_inside[0]
                    eo_result["y_cross"] = exceeded_inside[1]
                elif exceeded_outside:
                    eo_result["evaluation_result"] = "NOK_OUT_OF_RANGE"
                    eo_result["evaluation_reason"] = f"Exceeded limit ({limit}) but outside X-range"
                    eo_result["x_cross"] = exceeded_outside[0]
                    eo_result["y_cross"] = exceeded_outside[1]
                else:
                    eo_result["evaluation_result"] = "OK"
                    eo_result["evaluation_reason"] = f"Did not exceed limit ({limit}) in X-range"
        # LINE-Y: vertical check (x_ref) - expects Y range
        elif reaction == 'LINE-Y':
            if x_ref is None or y_min is None or y_max is None:
                eo_result["evaluation_result"] = "UNKNOWN"
                eo_result["evaluation_reason"] = "Missing X (ref) or YMin/YMax"
            else:
                # find curve point close to x_ref (small tolerance)
                tol = 1e-6
                found = None
                for x, y in curve_points:
                    if abs(x - x_ref) <= tol:
                        found = (x, y)
                        break
                if not found:
                    # find nearest by absolute difference
                    nearest = min(curve_points, key=lambda p: abs(p[0] - x_ref))
                    found = nearest
                y = found[1]
                if y_min <= y <= y_max:
                    eo_result["evaluation_result"] = "OK"
                    eo_result["evaluation_reason"] = "Value at Xref within Y range"
                    eo_result["x_cross"] = found[0]
                    eo_result["y_cross"] = found[1]
                else:
                    eo_result["evaluation_result"] = "NOK"
                    eo_result["evaluation_reason"] = "Value at Xref outside Y range"
                    eo_result["x_cross"] = found[0]
                    eo_result["y_cross"] = found[1]
        # MIN-MAX or LIMIT-RANGE: check if any point falls inside/outside rectangular region
        elif reaction in ['MIN-MAX', 'LIMIT-RANGE']:
            if x_min is None or x_max is None or y_min is None or y_max is None:
                eo_result["evaluation_result"] = "UNKNOWN"
                eo_result["evaluation_reason"] = "Missing rectangle boundaries"
            else:
                any_inside = any((x_min <= x <= x_max and y_min <= y <= y_max) for x, y in curve_points)
                if any_inside:
                    eo_result["evaluation_result"] = "OK"
                    eo_result["evaluation_reason"] = "At least one point inside limit rectangle"
                else:
                    eo_result["evaluation_result"] = "NOK"
                    eo_result["evaluation_reason"] = "No point within limit rectangle"
        else:
            eo_result["evaluation_result"] = "UNKNOWN"
            eo_result["evaluation_reason"] = f"Reaction type '{reaction}' not explicitly handled"

        # attach numeric parsed fields for frontend convenience
        eo['XMin_num'] = x_min
        eo['XMax_num'] = x_max
        eo['YMin_num'] = y_min
        eo['YMax_num'] = y_max
        eo['X_num'] = x_ref
        eo['Y_num'] = y_ref

        eo.update(eo_result)

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
