import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { TransactionService } from './transaction.service';
import { TransactionDocument } from './transaction.model';
import { CreateTransactionDto } from './dto/create-transaction.dto';

@Controller('transaction')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Post()
  async createTransaction(
    @Body() createTransactionDto: CreateTransactionDto,
  ): Promise<TransactionDocument> {
    return this.transactionService.create(createTransactionDto);
  }

  @Get(':id')
  async getTransaction(@Param('id') id: string): Promise<TransactionDocument> {
    return this.transactionService.findById(id);
  }
}
