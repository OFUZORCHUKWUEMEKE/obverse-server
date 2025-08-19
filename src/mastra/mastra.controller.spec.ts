import { Test, TestingModule } from '@nestjs/testing';
import { MastraController } from './mastra.controller';

describe('MastraController', () => {
  let controller: MastraController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MastraController],
    }).compile();

    controller = module.get<MastraController>(MastraController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
