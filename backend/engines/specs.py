# backend/engines/specs.py

# 1. 瀹氫箟搴曞眰鑳藉姏妗ｆ锛堣繖鏄湡姝ｇ殑鈥滃ぇ姹犲瓙鈥濆唴瀹癸級
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

# 2. 瀹氫箟鍚嶇О鏄犲皠琛紙瑙ｅ喅浣犺鐨勨€滃鍚嶇О鈥濋棶棰橈級
# 鏃犺鍙粈涔堝悕瀛楋紝鍙鏄犲皠鍒板悓涓€涓?Profile锛屽墠绔嬁鍒扮殑鑳藉姏灏辨槸涓€鏍风殑
MODEL_NAME_MAP = {
    "Nano pro": "pro_image_spec",
    "Nano Pro": "pro_image_spec",
    "Nano Banana Pro": "pro_image_spec",
    "gemini-3-pro-image-preview": "pro_image_spec",
    "Nano 2": "flash_image_spec",
    "Nano Banana 2": "flash_image_spec",
    "gemini-3.1-flash-image-preview": "flash_image_spec",
    "GPT-2": "gpt_image_spec"
}

# 3. 瀹氫箟鏈嶅姟鍟嗘嫢鏈夌殑妯″瀷锛堜緵鍓嶇娓叉煋鑿滃崟锛?
PROVIDER_MODELS = {
    "Google": ["Nano Pro", "Nano 2"],
    "Yunwu": ["Nano pro", "Nano 2", "GPT-2"]
}

def get_frontend_specs():
    """
    鑱氬悎鏁版嵁鍙戦€佺粰鍓嶇銆?
    鍓嶇灏嗘敹鍒帮細姣忎釜妯″瀷瀵瑰簲鐨勫叿浣撹兘鍔涳紝浠ュ強鏈嶅姟鍟嗗寘鍚摢浜涙ā鍨嬨€?
    """
    full_specs = {}
    for ui_name, profile_id in MODEL_NAME_MAP.items():
        full_specs[ui_name] = CAPABILITY_PROFILES.get(profile_id)
        
    return {
        "models": full_specs,          # 鍏蜂綋鐨勬ā鍨嬭兘鍔涙槧灏?
        "providers": PROVIDER_MODELS   # 鑿滃崟缁撴瀯
    }
