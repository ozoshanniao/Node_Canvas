# -*- coding: utf-8 -*-
import unittest
import asyncio
from unittest.mock import AsyncMock
from video_generation.schemas import VideoGenerateRequest
from video_generation.providers.kling.payloads import KlingPayloadBuilder
from video_generation.providers.kling.omni_payloads import KlingOmniPayloadBuilder
from video_generation.providers.kling.provider import KlingVideoProvider

# Mock 掉 resolve_image_for_kling 以防其加载本地图片或触发 Base64 转换
KlingPayloadBuilder.resolve_image_for_kling = AsyncMock(side_effect=lambda image_ref, project_path: image_ref)
KlingOmniPayloadBuilder.resolve_image_for_kling = AsyncMock(side_effect=lambda image_ref, project_path: image_ref)


class KlingPayloadBuilderRegressionTest(unittest.TestCase):
    def setUp(self):
        self.builder = KlingPayloadBuilder()
        self.omni_builder = KlingOmniPayloadBuilder()

    def run_async(self, coro):
        return asyncio.run(coro)

    def test_01_kling_v3_single_t2v(self):
        """1. kling-v3 single T2V"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit reading a newspaper.",
            aspectRatio="9:16",
            duration="5s",
            qualityMode="std",
            seed=12345,
            customParams={"kling": {"shotMode": "single"}}
        )
        payload = self.run_async(self.builder.build_text2video(req, None))
        
        self.assertEqual(payload.get("multi_shot"), False)
        self.assertEqual(payload.get("prompt"), "A rabbit reading a newspaper.")
        self.assertNotIn("shot_type", payload)
        self.assertNotIn("multi_prompt", payload)
        self.assertEqual(payload.get("mode"), "std")
        self.assertEqual(payload.get("duration"), "5")
        self.assertEqual(payload.get("aspect_ratio"), "9:16")
        self.assertNotIn("seed", payload)
        print("\n[PASS] Test Case 1: kling-v3 single T2V")

    def test_02_kling_v3_intelligence_t2v(self):
        """2. kling-v3 intelligence T2V"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit reading a newspaper.",
            duration="5s",
            qualityMode="std",
            customParams={"kling": {"shotMode": "intelligence"}}
        )
        payload = self.run_async(self.builder.build_text2video(req, None))

        self.assertEqual(payload.get("multi_shot"), True)
        self.assertEqual(payload.get("shot_type"), "intelligence")
        self.assertEqual(payload.get("prompt"), "A rabbit reading a newspaper.")
        self.assertNotIn("multi_prompt", payload)
        print("[PASS] Test Case 2: kling-v3 intelligence T2V")

    def test_03_kling_v3_customize_t2v(self):
        """3. kling-v3 customize T2V"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="",
            duration="5s",
            qualityMode="std",
            customParams={
                "kling": {
                    "shotMode": "customize",
                    "shotType": "customize",
                    "multiPrompt": [
                        { "index": 1, "prompt": "Shot one.", "duration": "2" },
                        { "index": 2, "prompt": "Shot two.", "duration": "3" }
                    ]
                }
            }
        )
        payload = self.run_async(self.builder.build_text2video(req, None))

        self.assertEqual(payload.get("multi_shot"), True)
        self.assertEqual(payload.get("shot_type"), "customize")
        self.assertEqual(payload.get("prompt"), "")
        self.assertEqual(len(payload.get("multi_prompt", [])), 2)
        self.assertEqual(payload.get("duration"), "5")
        print("[PASS] Test Case 3: kling-v3 customize T2V")

    def test_04_kling_v3_customize_i2v(self):
        """4. kling-v3 customize I2V"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="image-to-video",
            prompt="",
            images=["https://example.com/image.jpg"],
            endImage=None,
            aspectRatio="1:1",
            seed=12345,
            customParams={
                "kling": {
                    "shotMode": "customize",
                    "shotType": "customize",
                    "multiPrompt": [
                        { "index": 1, "prompt": "Shot one.", "duration": "2" },
                        { "index": 2, "prompt": "Shot two.", "duration": "3" }
                    ]
                }
            }
        )
        payload = self.run_async(self.builder.build_image2video(req, None))

        self.assertEqual(payload.get("image"), "https://example.com/image.jpg")
        self.assertEqual(payload.get("multi_shot"), True)
        self.assertEqual(payload.get("shot_type"), "customize")
        self.assertEqual(len(payload.get("multi_prompt", [])), 2)
        self.assertEqual(payload.get("duration"), "5")
        self.assertNotIn("aspect_ratio", payload)
        self.assertNotIn("seed", payload)
        print("[PASS] Test Case 4: kling-v3 customize I2V")

    def test_05_camera_control_preset(self):
        """5. Camera Control preset"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={
                "kling": {
                    "cameraControl": {
                        "type": "forward_up",
                        "axis": "pan",
                        "value": 0
                    }
                }
            }
        )
        payload = self.run_async(self.builder.build_text2video(req, None))

        self.assertEqual(payload.get("camera_control"), {"type": "forward_up"})
        print("[PASS] Test Case 5: Camera Control preset")

    def test_06_camera_control_simple(self):
        """6. Camera Control simple"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={
                "kling": {
                    "cameraControl": {
                        "type": "simple",
                        "axis": "pan",
                        "value": 5
                    }
                }
            }
        )
        payload = self.run_async(self.builder.build_text2video(req, None))

        self.assertEqual(payload.get("camera_control"), {
            "type": "simple",
            "config": { "pan": 5 }
        })
        print("[PASS] Test Case 6: Camera Control simple")

    def test_07_camera_control_clamp(self):
        """7. Camera Control clamp"""
        # value = 12
        req1 = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={
                "kling": {
                    "cameraControl": {
                        "type": "simple",
                        "axis": "pan",
                        "value": 12
                    }
                }
            }
        )
        payload1 = self.run_async(self.builder.build_text2video(req1, None))
        self.assertEqual(payload1.get("camera_control")["config"]["pan"], 10)

        # value = -12
        req2 = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={
                "kling": {
                    "cameraControl": {
                        "type": "simple",
                        "axis": "pan",
                        "value": -12
                    }
                }
            }
        )
        payload2 = self.run_async(self.builder.build_text2video(req2, None))
        self.assertEqual(payload2.get("camera_control")["config"]["pan"], -10)
        print("[PASS] Test Case 7: Camera Control clamp")

    def test_08_end_priority(self):
        """8. END 优先"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="image-to-video",
            prompt="A rabbit.",
            images=["https://example.com/start.jpg"],
            endImage="https://example.com/end.jpg",
            customParams={
                "kling": {
                    "cameraControl": {
                        "type": "forward_up"
                    }
                }
            }
        )
        payload = self.run_async(self.builder.build_image2video(req, None))

        self.assertIn("image_tail", payload)
        self.assertNotIn("camera_control", payload)
        print("[PASS] Test Case 8: END 优先")

    def test_09_kling_v2_6_multiShot_error(self):
        """9. kling-v2-6 multiShot"""
        req = VideoGenerateRequest(
            model="kling-v2-6",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={
                "kling": {
                    "shotMode": "customize",
                    "shotType": "customize",
                    "multiPrompt": [
                        { "index": 1, "prompt": "Shot one.", "duration": "2" }
                    ]
                }
            }
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req, None))
        self.assertEqual(str(ctx.exception), "Kling multi_shot is not supported for kling-v2-6.")
        print("[PASS] Test Case 9: kling-v2-6 multiShot (Error caught)")

    def test_10_kling_v3_omni_multiShot_error(self):
        """10. kling-v3-omni multiShot"""
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={
                "kling": {
                    "shotMode": "customize",
                    "shotType": "customize",
                    "multiPrompt": [
                        { "index": 1, "prompt": "Shot one.", "duration": "2" }
                    ]
                }
            }
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req, None))
        self.assertEqual(str(ctx.exception), "Kling multi_shot for kling-v3-omni is not supported yet.")
        print("[PASS] Test Case 10: kling-v3-omni multiShot (Error caught)")

    def test_11_invalid_multiPrompt(self):
        """11. invalid multiPrompt cases"""
        # 1. 空数组
        req_empty = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {"shotMode": "customize", "multiPrompt": []}}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_empty, None))
        self.assertIn("at least one shot", str(ctx.exception))

        # 2. 超过 6 个
        req_too_many = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [{"index": i, "prompt": "A", "duration": "2"} for i in range(7)]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_too_many, None))
        self.assertIn("supports up to 6 shots", str(ctx.exception))

        # 3. prompt 为空
        req_empty_prompt = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "", "duration": "3"}]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_empty_prompt, None))
        self.assertIn("prompt is required", str(ctx.exception))

        # 4. prompt 超过 512
        req_long_prompt = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "a" * 513, "duration": "3"}]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_long_prompt, None))
        self.assertIn("must be 512 characters or less", str(ctx.exception))

        # 5. duration < 1
        req_zero_dur = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "Shot one.", "duration": "0"}]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_zero_dur, None))
        self.assertIn("duration must be at least 1s", str(ctx.exception))

        # 6. duration 非整数
        req_float_dur = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "Shot one.", "duration": "abc"}]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_float_dur, None))
        self.assertIn("duration must be an integer", str(ctx.exception))

        # 7. totalDuration 超出 3-15 (太小，小于3)
        req_too_short = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "Shot one.", "duration": "2"}]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_too_short, None))
        self.assertIn("total duration must be between 3s and 15s", str(ctx.exception))

        # 8. totalDuration 超出 3-15 (太大，大于15)
        req_too_long = VideoGenerateRequest(
            model="kling-v3", provider="kling", videoMode="text-to-video", prompt="",
            customParams={"kling": {
                "shotMode": "customize",
                "multiPrompt": [
                    {"index": 1, "prompt": "Shot one.", "duration": "10"},
                    {"index": 2, "prompt": "Shot two.", "duration": "6"}
                ]
            }}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req_too_long, None))
        self.assertIn("total duration must be between 3s and 15s", str(ctx.exception))

        print("[PASS] Test Case 11: invalid multiPrompt checked")

    def test_12_element_list_none(self):
        """12. kling-v3 无 elementIds"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={"kling": {}}
        )
        payload = self.run_async(self.builder.build_text2video(req, None))
        self.assertEqual(payload.get("watermark_info"), {"enabled": False})
        self.assertNotIn("element_list", payload)
        print("[PASS] Test Case 12: kling-v3 无 elementIds")

    def test_13_element_list_single(self):
        """13. kling-v3 elementIds=['123456']"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={"kling": {"elementIds": ["123456"]}}
        )
        payload = self.run_async(self.builder.build_text2video(req, None))
        self.assertEqual(payload.get("watermark_info"), {"enabled": False})
        self.assertEqual(payload.get("element_list"), [{"element_id": 123456}])
        print("[PASS] Test Case 13: kling-v3 elementIds=['123456']")

    def test_14_element_list_omni(self):
        """14. kling-v3-omni elementIds=['123456']"""
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            images=["https://example.com/ref.jpg"],
            customParams={"kling": {"elementIds": ["123456"]}}
        )
        payload = self.run_async(self.builder.build_omni_video(req, None))
        self.assertEqual(payload.get("watermark_info"), {"enabled": False})
        self.assertEqual(payload.get("element_list"), [{"element_id": 123456}])
        print("[PASS] Test Case 14: kling-v3-omni elementIds=['123456']")

    def test_15_element_list_invalid_chars(self):
        """15. elementIds=['abc'] -> ValueError('Invalid Kling element ID.')"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={"kling": {"elementIds": ["abc"]}}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req, None))
        self.assertEqual(str(ctx.exception), "Invalid Kling element ID.")
        print("[PASS] Test Case 15: elementIds=['abc'] (ValueError caught)")

    def test_16_element_list_too_many(self):
        """16. elementIds 超过 3 个 -> ValueError('Kling element_list supports at most 3 elements.')"""
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A rabbit.",
            customParams={"kling": {"elementIds": ["123456", "789012", "345678", "901234"]}}
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.builder.build_text2video(req, None))
        self.assertEqual(str(ctx.exception), "Kling element_list supports at most 3 elements.")
        print("[PASS] Test Case 16: elementIds 超过 3 个 (ValueError caught)")

    def test_17_omni_prompt_only(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="reference-video",
            prompt="",
            duration="5s",
            qualityMode="std",
            customParams={"kling": {"omniParams": {
                "prompt": "Use @element_1",
                "elements": [{"elementId": 123456}],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("prompt"), "Use <<<element_1>>>")
        self.assertNotIn("image_list", payload)
        self.assertEqual(payload.get("watermark_info"), {"enabled": False})
        print("[PASS] Test Case 17: omni prompt only")

    def test_18_omni_reference_image(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="reference-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "resolvedPrompt": "A scene with <<<image_1>>>",
                "images": [{"url": "https://example.com/ref.jpg", "role": "reference"}],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("image_list"), [{"image_url": "https://example.com/ref.jpg"}])
        self.assertIn("aspect_ratio", payload)
        print("[PASS] Test Case 18: omni reference image")

    def test_19_omni_first_end_frames(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="reference-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "prompt": "Frames",
                "images": [
                    {"url": "https://example.com/start.jpg", "role": "first_frame"},
                    {"url": "https://example.com/end.jpg", "role": "end_frame"},
                ],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("image_list"), [
            {"image_url": "https://example.com/start.jpg", "type": "first_frame"},
            {"image_url": "https://example.com/end.jpg", "type": "end_frame"},
        ])
        self.assertNotIn("aspect_ratio", payload)
        print("[PASS] Test Case 19: omni first/end frames")

    def test_20_omni_invalid_roles(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="reference-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "prompt": "Bad",
                "images": [{"url": "https://example.com/end.jpg", "role": "end_frame"}],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni end_frame requires a first_frame image.")
        print("[PASS] Test Case 20: omni invalid roles")

    def test_21_omni_elements(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="reference-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "prompt": "Use @element_1",
                "elements": [{"elementId": 123456}],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("element_list"), [{"element_id": 123456}])
        print("[PASS] Test Case 21: omni elements")

    def test_22_omni_video_refs_not_supported(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="reference-video",
            prompt="",
            customParams={"kling": {"omniParams": {"prompt": "Video", "videos": [{"url": "x"}]}}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni video references are not supported yet.")
        print("[PASS] Test Case 22: omni video refs unsupported")

    def test_23_new_omni_prompt_only(self):
        """1. Omni prompt only"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            duration="5s",
            qualityMode="std",
            aspectRatio="16:9",
            generateAudio=True,
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "@element_1 cinematic scene",
                        "resolvedPrompt": "<<<element_1>>> cinematic scene",
                        "images": [],
                        "videos": [],
                        "elements": [
                            { "alias": "element_1", "elementId": 123456 }
                        ],
                        "isValid": True,
                        "errors": []
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        self.assertEqual(endpoint_kind, "omni-video")
        
        payload = self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(payload.get("model_name"), "kling-v3-omni")
        self.assertEqual(payload.get("prompt"), "<<<element_1>>> cinematic scene")
        self.assertEqual(payload.get("element_list"), [{"element_id": 123456}])
        self.assertNotIn("image_list", payload)
        self.assertEqual(payload.get("watermark_info"), {"enabled": False})
        self.assertEqual(payload.get("mode"), "std")
        self.assertEqual(payload.get("duration"), "5")
        self.assertEqual(payload.get("aspect_ratio"), "16:9")
        self.assertEqual(payload.get("sound"), "on")
        print("[PASS] Test Case 1: Omni prompt only")

    def test_24_new_omni_reference_images(self):
        """2. Omni reference images"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="@image_1 and @image_2",
            duration="5s",
            qualityMode="std",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "@image_1 and @image_2",
                        "images": [
                            { "alias": "image_1", "url": "input/a.png", "role": "reference" },
                            { "alias": "image_2", "url": "input/b.png", "role": "reference" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        payload = self.run_async(provider._payload_for_kind(endpoint_kind, req))
        
        self.assertEqual(payload.get("prompt"), "<<<image_1>>> and <<<image_2>>>")
        self.assertEqual(payload.get("image_list"), [
            { "image_url": "input/a.png" },
            { "image_url": "input/b.png" }
        ])
        for img in payload.get("image_list", []):
            self.assertNotIn("type", img)
        print("[PASS] Test Case 2: Omni reference images")

    def test_25_new_omni_first_end_frame(self):
        """3. Omni first/end frame"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            duration="5s",
            qualityMode="std",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "images": [
                            { "alias": "image_1", "url": "input/start.png", "role": "first_frame" },
                            { "alias": "image_2", "url": "input/end.png", "role": "end_frame" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        payload = self.run_async(provider._payload_for_kind(endpoint_kind, req))
        
        self.assertEqual(payload.get("image_list")[0].get("type"), "first_frame")
        self.assertEqual(payload.get("image_list")[1].get("type"), "end_frame")
        self.assertNotIn("aspect_ratio", payload)
        print("[PASS] Test Case 3: Omni first/end frame")

    def test_26_new_end_frame_without_first_frame(self):
        """4. end_frame without first_frame"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "images": [
                            { "alias": "image_1", "url": "input/end.png", "role": "end_frame" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling Omni end_frame requires a first_frame image.")
        print("[PASS] Test Case 4: end_frame without first_frame")

    def test_27_new_multiple_first_frame(self):
        """5. multiple first_frame"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "images": [
                            { "alias": "image_1", "url": "input/start1.png", "role": "first_frame" },
                            { "alias": "image_2", "url": "input/start2.png", "role": "first_frame" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling Omni supports at most one first_frame image.")
        print("[PASS] Test Case 5: multiple first_frame")

    def test_28_new_multiple_end_frame(self):
        """6. multiple end_frame"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "images": [
                            { "alias": "image_1", "url": "input/end1.png", "role": "end_frame" },
                            { "alias": "image_2", "url": "input/end2.png", "role": "end_frame" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling Omni supports at most one end_frame image.")
        print("[PASS] Test Case 6: multiple end_frame")

    def test_29_new_invalid_element_id(self):
        """7. invalid element id"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "elements": [
                            { "alias": "element_1", "elementId": "abc" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Invalid Kling element ID.")
        print("[PASS] Test Case 7: invalid element id")

    def test_30_new_more_than_3_elements(self):
        """8. more than 3 elements"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "elements": [
                            { "elementId": 1 },
                            { "elementId": 2 },
                            { "elementId": 3 },
                            { "elementId": 4 }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling element_list supports at most 3 elements.")
        print("[PASS] Test Case 8: more than 3 elements")

    def test_31_new_videos_not_supported_yet(self):
        """9. videos not supported yet"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "Test",
                        "videos": [
                            { "alias": "video_1", "url": "xxx.mp4" }
                        ]
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling Omni video references are not supported yet.")
        print("[PASS] Test Case 9: videos not supported yet")

    def test_32_new_missing_omniParams(self):
        """10. missing omniParams"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {}
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling Omni params are required.")
        print("[PASS] Test Case 10: missing omniParams")

    def test_33_new_empty_prompt(self):
        """11. empty prompt"""
        provider = KlingVideoProvider(provider_type="yunwu-kling")
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="yunwu-kling",
            videoMode="reference-video",
            prompt="",
            customParams={
                "kling": {
                    "omniParams": {
                        "prompt": "",
                        "resolvedPrompt": ""
                    }
                }
            }
        )
        endpoint_kind = provider._endpoint_kind(req)
        with self.assertRaises(ValueError) as ctx:
            self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(str(ctx.exception), "Kling Omni prompt is required.")
        print("[PASS] Test Case 11: empty prompt")

    def test_34_new_ordinary_kling_v3_unaffected(self):
        """12. ordinary kling-v3 unaffected"""
        provider = KlingVideoProvider(provider_type="kling")
        req = VideoGenerateRequest(
            model="kling-v3",
            provider="kling",
            videoMode="text-to-video",
            prompt="A test prompt.",
            duration="5s",
            qualityMode="std"
        )
        endpoint_kind = provider._endpoint_kind(req)
        self.assertEqual(endpoint_kind, "text2video")
        
        payload = self.run_async(provider._payload_for_kind(endpoint_kind, req))
        self.assertEqual(payload.get("model_name"), "kling-v3")
        self.assertEqual(payload.get("prompt"), "A test prompt.")
        print("[PASS] Test Case 12: ordinary kling-v3 unaffected")

    def test_35_omni_no_video_total_limit_error(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "prompt": "Too many",
                "images": [{"url": f"https://example.com/{index}.png"} for index in range(8)],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni image and element references support at most 7 total items.")
        print("[PASS] Test Case 35: image + element total limit rejected")

    def test_36_omni_video_refs_not_supported(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "prompt": "Video",
                "videos": [{"url": "https://example.com/a.mp4"}],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni video references are not supported yet.")
        print("[PASS] Test Case 36: omni video references disabled")

    def test_37_omni_unknown_video_alias_error(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "prompt": "@video_2 should fail",
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Unknown Omni reference: @video_2")
        print("[PASS] Test Case 37: unknown @video_2 rejected")

    def test_38_omni_single_multi_shot_false(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "shotMode": "single",
                "prompt": "@image_1 moves",
                "images": [{"url": "https://example.com/1.png", "role": "reference"}],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("multi_shot"), False)
        self.assertEqual(payload.get("prompt"), "<<<image_1>>> moves")
        self.assertNotIn("shot_type", payload)
        self.assertNotIn("multi_prompt", payload)
        print("[PASS] Test Case 38: omni single multi_shot=false")

    def test_39_omni_intelligence_multi_shot(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            customParams={"kling": {"omniParams": {
                "shotMode": "intelligence",
                "prompt": "@image_1 story",
                "images": [{"url": "https://example.com/1.png", "role": "reference"}],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("multi_shot"), True)
        self.assertEqual(payload.get("shot_type"), "intelligence")
        self.assertEqual(payload.get("prompt"), "<<<image_1>>> story")
        self.assertNotIn("multi_prompt", payload)
        print("[PASS] Test Case 39: omni intelligence multi_shot")

    def test_40_omni_customize_multi_shot(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            duration="5s",
            durationSeconds=5,
            customParams={"kling": {"omniParams": {
                "shotMode": "customize",
                "prompt": "",
                "images": [{"url": "https://example.com/1.png", "role": "reference"}],
                "multiPrompt": [
                    {"index": 1, "prompt": "@image_1 enters", "duration": "2"},
                    {"index": 2, "prompt": "Camera follows @image_1", "duration": "3"},
                ],
            }}},
        )
        payload = self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(payload.get("multi_shot"), True)
        self.assertEqual(payload.get("shot_type"), "customize")
        self.assertEqual(payload.get("prompt"), "")
        self.assertEqual(payload.get("multi_prompt")[0]["prompt"], "<<<image_1>>> enters")
        self.assertEqual(payload.get("multi_prompt")[1]["duration"], "3")
        print("[PASS] Test Case 40: omni customize multi_shot")

    def test_41_omni_customize_missing_multi_prompt(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            customParams={"kling": {"omniParams": {"shotMode": "customize"}}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Omni multi-shot customize requires multi_prompt.")
        print("[PASS] Test Case 41: omni customize missing multiPrompt")

    def test_42_omni_customize_too_many_shots(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            durationSeconds=7,
            customParams={"kling": {"omniParams": {
                "shotMode": "customize",
                "multiPrompt": [{"index": i, "prompt": "shot", "duration": "1"} for i in range(1, 8)],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni multi_prompt supports 1 to 6 shots.")
        print("[PASS] Test Case 42: omni customize too many shots")

    def test_43_omni_customize_duration_sum_mismatch(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            durationSeconds=5,
            customParams={"kling": {"omniParams": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "shot", "duration": "3"}],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni multi_prompt duration must sum to total duration.")
        print("[PASS] Test Case 43: omni customize duration mismatch")

    def test_44_omni_customize_empty_shot_prompt(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            durationSeconds=3,
            customParams={"kling": {"omniParams": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "", "duration": "3"}],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni multi_prompt prompt is required.")
        print("[PASS] Test Case 44: omni customize empty prompt")

    def test_45_omni_customize_long_shot_prompt(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            durationSeconds=3,
            customParams={"kling": {"omniParams": {
                "shotMode": "customize",
                "multiPrompt": [{"index": 1, "prompt": "a" * 513, "duration": "3"}],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Kling Omni multi_prompt prompt must be at most 512 characters.")
        print("[PASS] Test Case 45: omni customize long prompt")

    def test_46_omni_customize_unknown_image_alias(self):
        req = VideoGenerateRequest(
            model="kling-v3-omni",
            provider="kling",
            videoMode="omni-video",
            prompt="",
            durationSeconds=3,
            customParams={"kling": {"omniParams": {
                "shotMode": "customize",
                "images": [{"url": "https://example.com/1.png", "role": "reference"}],
                "multiPrompt": [{"index": 1, "prompt": "@image_3 appears", "duration": "3"}],
            }}},
        )
        with self.assertRaises(ValueError) as ctx:
            self.run_async(self.omni_builder.build_omni_payload(req, None))
        self.assertEqual(str(ctx.exception), "Unknown Omni reference: @image_3")
        print("[PASS] Test Case 46: omni customize unknown image alias")


if __name__ == "__main__":
    unittest.main()
