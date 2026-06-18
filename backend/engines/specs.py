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
    "kie_nano_banana_pro_spec": {
        "id": "nano-banana-pro",
        "label": "Nano Banana Pro (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "nano-banana",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search"],
        "supports_reference": True,
        "featured": True,
        "experimental": False,
    },
    "kie_nano_banana_2_spec": {
        "id": "nano-banana-2",
        "label": "Nano Banana 2 (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "nano-banana",
        "taskTypes": ["text-to-image", "image-to-image"],
        "ratios": ["auto", "1:1", "3:2", "2:3", "3:4", "4:3", "4:5", "5:4", "9:16", "16:9", "1:4", "4:1", "1:8", "8:1", "21:9"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "features": ["google_search", "image_search"],
        "supports_reference": True,
        "featured": True,
        "experimental": False,
    },
    "kie_gpt_image_2_t2i_spec": {
        "id": "gpt-image-2-text-to-image",
        "label": "GPT Image 2 (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "gpt-image",
        "taskTypes": ["text-to-image"],
        "ratios": ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "supports_reference": False,
        "featured": True,
        "experimental": False,
        "constraints": {
            "autoAspectRatioResolution": "1K",
            "squareAspectRatioDisallows": ["4K"],
        },
    },
    "kie_gpt_image_2_i2i_spec": {
        "id": "gpt-image-2-image-to-image",
        "label": "GPT Image 2 I2I (KIE)",
        "provider": "kie",
        "mediaType": "image",
        "family": "gpt-image",
        "taskTypes": ["image-to-image"],
        "ratios": ["auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5", "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21"],
        "resolutions": ["1K", "2K", "4K"],
        "output_format": ["png", "jpeg"],
        "supports_reference": True,
        "featured": True,
        "experimental": False,
        "internalImageInputField": "input_urls",
        "maxImages": 16,
        "constraints": {
            "autoAspectRatioResolution": "1K",
            "squareAspectRatioDisallows": ["4K"],
        },
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
    "GPT-2": "gpt_image_spec",
    "Nano Banana Pro (KIE)": "kie_nano_banana_pro_spec",
    "Nano Banana 2 (KIE)": "kie_nano_banana_2_spec",
    "GPT Image 2 (KIE)": "kie_gpt_image_2_t2i_spec",
    "GPT Image 2 I2I (KIE)": "kie_gpt_image_2_i2i_spec",
}

# 3. 瀹氫箟鏈嶅姟鍟嗘嫢鏈夌殑妯″瀷锛堜緵鍓嶇娓叉煋鑿滃崟锛?
PROVIDER_MODELS = {
    "Google": ["Nano Pro", "Nano 2"],
    "Yunwu": ["Nano pro", "Nano 2", "GPT-2"],
    "KIE": ["Nano Banana Pro (KIE)", "Nano Banana 2 (KIE)", "GPT Image 2 (KIE)", "GPT Image 2 I2I (KIE)"]
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
