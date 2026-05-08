# backend/engines/specs.py

# 1. 定义底层能力档案（这是真正的“大池子”内容）
CAPABILITY_PROFILES = {
    "pro_image_spec": {
        "ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search"],
        "supports_reference": True
    },
    "flash_image_spec": {
        "ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search"],
        "supports_reference": True
    },
        "gpt_image_spec": {
        "ratios": ["auto", "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg", "webp"],
        "quality": ["auto", "low", "medium", "high"],
        "n": {
            "type": "slider",
            "min": 1,
            "max": 10,
            "step": 1,
            "default": 1,
            "label": "Batch Size" 
        },
        "supports_reference": True
    }
}

# 2. 定义名称映射表（解决你说的“多名称”问题）
# 无论叫什么名字，只要映射到同一个 Profile，前端拿到的能力就是一样的
MODEL_NAME_MAP = {
    "Nano pro": "pro_image_spec",         # 云雾中的叫法
    "Nano Banana Pro": "pro_image_spec",  # Google 中的叫法
    "Nano 2": "flash_image_spec",
    "Nano Banana 2": "flash_image_spec",
    "GPT-2": "gpt_image_spec"             # 假设 GPT-2 也共用这套规格
}

# 3. 定义服务商拥有的模型（供前端渲染菜单）
PROVIDER_MODELS = {
    "Google": ["Nano Banana Pro", "Nano Banana 2"],
    "Yunwu": ["Nano pro", "Nano 2", "GPT-2"]
}

def get_frontend_specs():
    """
    聚合数据发送给前端。
    前端将收到：每个模型对应的具体能力，以及服务商包含哪些模型。
    """
    full_specs = {}
    for ui_name, profile_id in MODEL_NAME_MAP.items():
        full_specs[ui_name] = CAPABILITY_PROFILES.get(profile_id)
        
    return {
        "models": full_specs,          # 具体的模型能力映射
        "providers": PROVIDER_MODELS   # 菜单结构
    }