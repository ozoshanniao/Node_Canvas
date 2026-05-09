class BaseImageProvider:
    async def generate(self, request):
        raise NotImplementedError

