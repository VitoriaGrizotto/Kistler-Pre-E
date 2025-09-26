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

def _safe_parse_value(value_str):
    """
    Parses a string value that might contain both a number and a unit.
    Converts numbers from comma to dot decimal.
    Returns a dictionary {'value': float_or_none, 'unit': str_or_none}.
    """
    if not isinstance(value_str, str):
        return {'value': None, 'unit': None}
    
    value_str = value_str.strip()
    if not value_str:
        return {'value': None, 'unit': None}

    # Regex to find a number (integer or float with comma/dot) followed by an optional unit
    match = re.match(r'([-+]?\d+(?:[.,]\d+)?)\s*(\S*)', value_str)
    if match:
        num_str = match.group(1).replace(',', '.')
        unit_str = match.group(2) if match.group(2) else None
        try:
            return {'value': float(num_str), 'unit': unit_str}
        except ValueError:
            return {'value': None, 'unit': unit_str}
    
    # If no number is found, return the original string as a potential unit/label
    return {'value': None, 'unit': value_str if value_str else None}


def parse_kistler_csv(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    data = {
        "result_info": {},
        "process_values_curve_related": {},
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

    # --- NEW: Extract 'Entry' from "Process values - EO related"
    entry_value = "N/A" # Default if not found
    
    # Find the block "Process values - EO related"
    # It starts with "Process values - EO related" and ends before the next major section
    pv_eo_related_block_match = re.search(
        r'Process values - EO related\n(.*?)(?=\n\n|\nEvaluation objects settings|\nMeasuring curve)', 
        content, 
        re.DOTALL
    )

    if pv_eo_related_block_match:
        block_content = pv_eo_related_block_match.group(1).strip()
        lines = block_content.split('\n')

        if len(lines) >= 2: # Expect at least header and one data line
            header_line_str = lines[0] # e.g., "Result;Entry;Exit;XMIN-X;..."
            headers = [h.strip() for h in header_line_str.split(';')]
            
            try:
                # Find the index of the 'Entry' column
                entry_col_index = headers.index('Entry')
            except ValueError:
                entry_col_index = -1 # 'Entry' header not found

            if entry_col_index != -1:
                # Iterate through data lines to find EO-01
                # The format is `EO-XX;Result;Entry;Exit;...`
                for i in range(1, len(lines)): # Start from second line (data lines)
                    line = lines[i]
                    parts = [p.strip() for p in line.split(';')]
                    
                    if parts and parts[0] == 'EO-01':
                        if len(parts) > entry_col_index:
                            raw_entry = parts[entry_col_index]
                            if raw_entry:
                                entry_value = raw_entry.replace(',', '.')
                                # Optionally try to convert to float to validate, but keep as string if not a valid float
                                try:
                                    entry_value = str(float(entry_value)) 
                                except ValueError:
                                    pass # Keep as is if not a valid number
                            break # Found EO-01 entry, stop searching
    
    data["result_info"]["Entry"] = entry_value


    # --- Process values - curve related
    process_values_curve_related_match = re.search(
        r'Process values - curve related\n(.*?)(?=\n\n|\nProcess values - EO related|\nEvaluation objects settings|\nMeasuring curve)',
        content,
        re.DOTALL
    )
    if process_values_curve_related_match:
        pvcr_lines = process_values_curve_related_match.group(1).strip().split('\n')
        for line in pvcr_lines:
            parts = [p.strip() for p in line.split(';')]
            
            if len(parts) >= 3 and parts[0]:
                key1 = parts[0]
                value_unit1 = _safe_parse_value(parts[1] + (f" {parts[2]}" if parts[2] else ""))
                data["process_values_curve_related"][key1] = value_unit1
            
            if len(parts) >= 6 and parts[3]:
                key2 = parts[3]
                value_unit2 = _safe_parse_value(parts[4] + (f" {parts[5]}" if parts[5] else ""))
                data["process_values_curve_related"][key2] = value_unit2

    # --- Evaluation objects settings
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
                    is_eo = parts[0].startswith('EO-')
                    reaction_value = parts[1] if len(parts) > 1 else ''
                    is_not_off = reaction_value != 'OFF'
                    if is_eo and is_not_off: 
                        eo_data = {}
                        for i_h, header in enumerate(headers):
                            if i_h < len(parts):
                                value = parts[i_h]
                                if isinstance(value, str) and ',' in value:
                                    value = value.replace(',', '.')
                                eo_data[header] = value
                        eo_data['EO_Identifier'] = parts[0]
                        data["evaluation_objects"].append(eo_data)
    
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

    # --- Avaliar cada EO com base na curva
    xs = data["measuring_curve"]["X"]
    ys = data["measuring_curve"]["Y"]
    curve_points = list(zip(xs, ys))

    for eo in data["evaluation_objects"]:
        reaction = eo.get('Reaction', '')
        eo_id = eo.get('EO_Identifier', 'EO-UNKNOWN')
        
        x_min = _safe_float(eo.get('XMin'))
        x_max = _safe_float(eo.get('XMax'))
        y_min = _safe_float(eo.get('YMin'))
        y_max = _safe_float(eo.get('YMax'))
        y_ref = _safe_float(eo.get('Y-Reference')) 
        x_ref = _safe_float(eo.get('X-Reference'))

        eo_result = {
            "evaluation_result": "UNKNOWN",
            "evaluation_reason": "",
            "x_cross": None,
            "y_cross": None
        }

        if not curve_points:
            eo_result["evaluation_result"] = "UNKNOWN"
            eo_result["evaluation_reason"] = "No curve data to evaluate"
            eo.update(eo_result)
            continue

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
                            if crossed_outside is None:
                                crossed_outside = (x, y)
                if crossed_inside:
                    eo_result["evaluation_result"] = "OK"
                    eo_result["evaluation_reason"] = f"Reached YMin ({y_min}) inside interval [{x_min},{x_max}]"
                    eo_result["x_cross"] = crossed_inside[0]
                    eo_result["y_cross"] = crossed_inside[1]
                elif crossed_outside:
                    eo_result["evaluation_result"] = "NOK_OUT_OF_RANGE"
                    eo_result["evaluation_reason"] = f"Reached YMin ({y_min}) but outside X-range [{x_min},{x_max}]"
                    eo_result["x_cross"] = crossed_outside[0]
                    eo_result["y_cross"] = crossed_outside[1]
                else:
                    eo_result["evaluation_result"] = "NOK"
                    eo_result["evaluation_reason"] = f"Did not reach YMin ({y_min})"
        elif reaction == 'NO-PASS':
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
                    eo_result["evaluation_reason"] = f"Exceeded limit ({limit}) inside X-range [{x_min},{x_max}]"
                    eo_result["x_cross"] = exceeded_inside[0]
                    eo_result["y_cross"] = exceeded_inside[1]
                elif exceeded_outside:
                    eo_result["evaluation_result"] = "NOK_OUT_OF_RANGE"
                    eo_result["evaluation_reason"] = f"Exceeded limit ({limit}) but outside X-range [{x_min},{x_max}]"
                    eo_result["x_cross"] = exceeded_outside[0]
                    eo_result["y_cross"] = exceeded_outside[1]
                else:
                    eo_result["evaluation_result"] = "OK"
                    eo_result["evaluation_reason"] = f"Did not exceed limit ({limit}) in X-range [{x_min},{x_max}]"
        elif reaction == 'LINE-Y':
            if x_ref is None or y_min is None or y_max is None:
                eo_result["evaluation_result"] = "UNKNOWN"
                eo_result["evaluation_reason"] = "Missing X (ref) or YMin/YMax"
            else:
                tol = 1e-6
                found = None
                for x, y in curve_points:
                    if abs(x - x_ref) <= tol:
                        found = (x, y)
                        break
                
                if not found and curve_points:
                    nearest = min(curve_points, key=lambda p: abs(p[0] - x_ref))
                    found = nearest

                if found:
                    y_at_x_ref = found[1]
                    if y_min <= y_at_x_ref <= y_max:
                        eo_result["evaluation_result"] = "OK"
                        eo_result["evaluation_reason"] = f"Value at Xref ({x_ref}) within Y range [{y_min},{y_max}]"
                        eo_result["x_cross"] = found[0]
                        eo_result["y_cross"] = found[1]
                    else:
                        eo_result["evaluation_result"] = "NOK"
                        eo_result["evaluation_reason"] = f"Value at Xref ({x_ref}) outside Y range [{y_min},{y_max}]"
                        eo_result["x_cross"] = found[0]
                        eo_result["y_cross"] = found[1]
                else:
                    eo_result["evaluation_result"] = "NOK"
                    eo_result["evaluation_reason"] = f"Could not find curve point near Xref ({x_ref})"

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